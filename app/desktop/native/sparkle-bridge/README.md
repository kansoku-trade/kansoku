# sparkle-bridge 的 no-op install 脚本是干嘛的

`package.json` 里 `"install": "node -e \"\""` 看着像什么都不做,其实是故意的
——npm 只要发现包目录下有 `binding.gyp`,就算没写 `install`/`postinstall` 脚本
也会自动跑 `node-gyp rebuild`（这是 npm 的老行为,遗留至今)。这个自动构建用的
是当前 Node 的 ABI,不是 Electron 的,跟这个原生模块实际要跑的目标（`electron
43.1.0` 的 ABI,见 `package.json` 的 `rebuild` 脚本里 `--dist-url
=https://electronjs.org/headers`) 对不上——装依赖阶段（`pnpm install`,不管是
本地开发机还是 CI runner)会先跑出一份注定要被扔掉、ABI 还不对的构建产物,纯属
浪费时间。

真正的构建走 `npm run build`（`fetch-sparkle` + 针对 Electron ABI 的
`rebuild`),由 `app/desktop/package.json` 的 `predev`/`prestart`/`package`
脚本显式触发。这里的 `install` 脚本写成 no-op,就是为了把 npm 的隐式自动构建
关掉,让"什么时候构建、按什么 ABI 构建"完全由上层脚本说了算。
