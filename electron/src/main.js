// This is main process of Electron, started as first thing when your
// app starts. It runs through entire life of your application.
// It doesn't have any windows which you can see on screen, but we can open
// window from here.

import path from "path";
import url from "url";
import { app, Menu, ipcMain, shell } from "electron";
import appMenuTemplate from "./menu/app_menu_template";
import editMenuTemplate from "./menu/edit_menu_template";
import devMenuTemplate from "./menu/dev_menu_template";
import createWindow from "./helpers/window";
import fs from "fs";
import http from "http";
import crypto from "crypto";

// Special module holding environment variables which you declared
// in config/env_xxx.json file.
import env from "env";

const remoteServer = "http://45.131.109.228:3000";

// Save userData in separate folders for each environment.
// Thanks to this you can use production and development versions of the app
// on same machine like those are two separate apps.
if (env.name !== "production") {
  const userDataPath = app.getPath("userData");
  app.setPath("userData", `${userDataPath} (${env.name})`);
}

const setApplicationMenu = () => {
  const menus = [appMenuTemplate, editMenuTemplate];
  if (env.name !== "production") {
    menus.push(devMenuTemplate);
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(menus));
};

// We can communicate with our window (the renderer process) via messages.
const initIpc = () => {
  ipcMain.on("need-app-path", (event, arg) => {
    event.reply("app-path", app.getAppPath());
  });
  ipcMain.on("open-external-link", (event, href) => {
    shell.openExternal(href);
  });
};

app.on("ready", () => {
  setApplicationMenu();
  initIpc();

  const mainWindow = createWindow("main", {
    width: 1000,
    height: 600,
    webPreferences: {
      // Two properties below are here for demo purposes, and are
      // security hazard. Make sure you know what you're doing
      // in your production app.
      nodeIntegration: true,
      contextIsolation: false,
      // Spectron needs access to remote module
      enableRemoteModule: env.name === "test"
    }
  });

  mainWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, "app.html"),
      protocol: "file:",
      slashes: true
    })
  );

  if (env.name === "development") {
    mainWindow.openDevTools();
  }
});

ipcMain.on('viewLocalFiles', (event, arg="C:\\GreenWave") => {
  if(!fs.existsSync(arg))
  {
    // We cant open this because it doesnt exist
    event.returnValue = 'failed';
    return;
  }
  require('child_process').exec('start "" '+arg);
  event.returnValue = 'opened';
});

ipcMain.on('update', (event, arg) => {
  console.log("Running Update");
  console.log(JSON.stringify(arg));
  const filePath = arg.path+"\\GreenWave_v"+arg.version+".exe";
  const oldFilePath = arg.path+"\\"+arg.replacing;
  console.log(filePath);
  const download = fs.createWriteStream(filePath);
  const request = http.get(remoteServer+"/GreenWave_v0.3.5.exe", function(response) {
    response.pipe(download);

    // after download completed close filestream
    download.on("finish", () => {
        download.close();
        console.log("Download Completed");
        const file = fs.readFileSync(filePath);
        let hash = crypto.createHash('md5').update(file).digest("hex");
        //let hash = 1;
        if(hash !== arg.md5)
        {
          console.log("Hash mismatch");
          console.log("Got: "+hash);
          console.log("Expected: "+arg.md5);
          event.returnValue = 'bad_hash';
          return;
        }
        // Delete old version
        if(fs.existsSync(oldFilePath))
        {
          fs.rmSync(oldFilePath);
        }
        event.returnValue = 'success';
    });
  });
});

ipcMain.on('checkLocalVersion', (event, arg="C:\\GreenWave") => {
  console.log('Checking Path: '+arg);
  let out = {
    fileName: 'undefined',
    version: '?.?.?',
    md5: 'undefined',
    status: 'missing'
  };
  if(!fs.existsSync(arg))
  {
    console.log('Could not find a directory: '+arg);
    console.log('Creating new directory at: '+arg);
    fs.mkdirSync(arg);
    out.status = 'new_dir'
    event.returnValue = out;
    return;
  }
  const listing = fs.readdirSync(arg);
  if(!listing)
  {
    console.log('Could not find a directory: '+arg);
    out.status = 'empty_dir'
    event.returnValue = out;
    return;
  }
  for(let file of listing)
  {
    const ext = file.substring(file.length-4);
    console.log('Checking file: '+ext);
    if(ext === '.exe')
    {
      // We found an EXE
      const fileContents = fs.readFileSync(arg+'\\'+file);
      let hash = crypto.createHash('md5').update(fileContents).digest("hex");
      console.log('Hashed Value:');
      console.log(hash);
      let version = file.split('_v')[1];
      if(version)
      {
        version = version.split('.exe')[0];
      }
      else
      {
        console.log('Could not detect file version: '+file);
        out.status = 'corrupt_dir'
        event.returnValue = out;
        return;
      }
      console.log('Detected Local Version: '+version);
      out.status = 'found';
      out.version = version;
      out.fileName = file;
      out.md5 = hash;
      event.returnValue = out;
      return;
    }
  }
  console.log('Could not find an installed version');
  event.returnValue = '_missing_file';
});

app.on("window-all-closed", () => {
  app.quit();
});
