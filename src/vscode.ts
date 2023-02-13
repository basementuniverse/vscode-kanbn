export interface VSCodeApi {
  getState: () => any
  setState: (newState: any) => any
  postMessage: (message: any) => void
}

declare let acquireVsCodeApi: Function
const vscode: VSCodeApi = acquireVsCodeApi()
export default vscode
