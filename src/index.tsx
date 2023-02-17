import * as React from 'react'
import Board from './Board'
import Burndown from './Burndown'
import TaskEditor from './TaskEditor'
import './index.css'

import { createRoot } from 'react-dom/client'

const domNodeBoard = document.getElementById('root-board')
if (domNodeBoard !== null) {
  const rootBoard = createRoot(domNodeBoard)
  rootBoard.render(<Board />)
} else {
  const domNodeBurndown = document.getElementById('root-burndown')
  if (domNodeBurndown !== null) {
    const rootBurndown = createRoot(domNodeBurndown)
    rootBurndown.render(<Burndown />)
  } else {
    const domNodeTask = document.getElementById('root-task')
    if (domNodeTask !== null) {
      const rootTask = createRoot(domNodeTask)
      rootTask.render(<TaskEditor />)
    }
  }
}
