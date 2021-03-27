// import * as vscode from 'vscode';
import Board from './Board';
import Header from './Header';
import React, { useEffect, useState } from "react";

function App(props) {
  // const [cwd, setCwd] = useState('initialcwd');
  // const [index, setIndex] = useState({});
  // const [tasks, setTasks] = useState([]);

  // useEffect(() => {
  //   // process.chdir(vscode!.workspace.workspaceFolders[0].uri.fsPath);
  //   import('@basementuniverse/kanbn/src/main').then(kanbn => {
  //     vscode.postMessage({
  //       command: 'error',
  //       text: 'hello!'
  //     });
  //   });
  // });
  // console.log(vscode!.workspace.workspaceFolders[0].uri.fsPath);

  // window.addEventListener('message', event => {
  //   const message = event.data; // The JSON data our extension sent
  //   switch (message.command) {
  //     case 'test':
  //       setCwd(message.cwd);
  //       break;
  //   }
  // });

  return (
    <div>
      <Header />
      <Board />
    </div>
  );
}

export default App;
