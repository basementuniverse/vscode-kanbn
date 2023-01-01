export default interface VSCodeApi {
  getState: () => any
  setState: (newState: any) => any
  postMessage: (message: any) => void
}
