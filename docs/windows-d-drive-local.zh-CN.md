# VisionCut Windows D 盘本地数据启动

本文说明如何让 VisionCut 的项目媒体、浏览器 OPFS/IndexedDB、缓存、下载和
临时文件使用专用 D 盘目录，同时不读取或修改用户默认 Chrome/Edge 资料。

## 推荐启动

在位于 D 盘的 VisionCut 工作树中运行：

```powershell
.\start-web.ps1
```

默认数据根目录为：

```text
D:\VisionCut-Data
```

启动器会自动查找 Chrome，找不到时使用 Edge。也可明确指定：

```powershell
.\start-web.ps1 -Browser Chrome
.\start-web.ps1 -Browser Edge
```

也可以把数据放在当前仓库的子目录中：

```powershell
.\start-web.ps1 -DataRoot ".\.tmp\visioncut-data"
```

启动后请使用脚本打开的浏览器窗口，不要另用日常浏览器手动打开本地网址。

## 数据落点

默认布局如下：

```text
D:\VisionCut-Data\
  Browser\
    Chrome|Edge\
      User Data\       # 独立浏览器 Profile，包含 IndexedDB/OPFS
      Cache\
      Media Cache\
  Downloads\           # 独立 Profile 的初始默认下载目录
  Temp\                 # Web 服务和浏览器继承的 TEMP/TMP
  Caches\               # Bun、npm 和 XDG 缓存
  Logs\                 # 本地服务日志
  Runtime\              # 本地服务状态
  visioncut-storage-layout.json
```

Next.js 的 `.next`、依赖和工作树文件仍在 D 盘仓库内。

## 下载目录策略

首次启动专用 Profile 前，脚本会在该 Profile 的 `Preferences` 中写入：

- `download.default_directory = D:\VisionCut-Data\Downloads`
- `savefile.default_directory = D:\VisionCut-Data\Downloads`
- 默认不弹出另存为目录选择

这只是 VisionCut 专用 Profile 的初始偏好，不是修改 Windows 注册表的企业
策略，也不会影响日常 Chrome/Edge。用户仍可在专用浏览器设置中更改目录；
网站本身也不能阻止用户选择其他下载位置。

如果专用 Profile 已经打开，启动器不会在线改写 `Preferences`，避免破坏正在
运行的浏览器资料。它会复用原先写入的设置，并将本地页面开到新标签页。

## 已有服务的处理

启动器会检查端口所有者和进程命令行：

- 如果当前工作树已有一个可响应的 VisionCut/Next.js 服务，直接复用。
- 如果请求端口被其他程序占用，立即中止并提示换端口，不停止对方进程。
- 如果当前工作树同时运行多个服务，要求明确选择端口。
- 新服务只监听 `127.0.0.1`，不会主动暴露到局域网。

已运行进程的 `TEMP`/缓存环境无法被启动器事后修改。复用这类服务时，脚本会
明确警告“服务环境未由本次启动器管理”；专用浏览器的 Profile、OPFS 和缓存
仍然使用 D 盘。需要让服务临时目录也受管理时，应先正常停止旧服务，再由本
启动器首次启动。

示例：

```powershell
.\start-web.ps1 -ExactPort -Port 3300
```

仅检查配置和已运行服务，不写目录、不启动进程：

```powershell
.\start-web.ps1 -ValidateOnly
```

仅启动或复用服务：

```powershell
.\start-web.ps1 -NoBrowser
```

使用 `-NoBrowser` 后，OPFS/IndexedDB 的位置取决于用户随后打开网址时所用的
浏览器 Profile，因此不属于 D 盘媒体路径保证。

停止由当前工作树运行的服务：

```powershell
.\scripts\windows\Stop-VisionCutLocal.ps1 -Port 3200
```

停止脚本会再次核对端口所有者、工作树路径和运行状态。端口属于其他程序时，
它不会停止该程序。

## 路径安全

脚本只接受以下数据根目录：

1. 当前 D 盘仓库的子目录。
2. `D:\VisionCut-Data` 本身或其子目录。

脚本拒绝：

- C 盘或其他盘符。
- `D:\` 盘符根目录。
- D 盘上未经批准的任意目录。
- 路径中已有的符号链接或目录联接。
- 被其他程序占用的服务端口。

这些限制防止路径参数误写用户目录，也防止启动器误用默认浏览器资料。

## 自检

运行无需 Pester 的脚本自检：

```powershell
.\scripts\windows\Test-VisionCutLocal.ps1
```

自检覆盖：

- PowerShell 语法。
- C 盘、盘符根目录和未批准 D 盘目录拒绝。
- 所有生成目录都位于批准的数据根目录。
- Chrome/Edge 下载偏好写入专用 Profile。
- 当前工作树服务识别。
- 测试临时文件只在仓库 D 盘目录中创建并安全清理。

## 实际边界

这个方案保证的是：**使用启动器打开的专用浏览器 Profile 时，VisionCut 项目
媒体及启动器管理的数据落在 D 盘。**

它不等于操作系统级“C 盘零写入”：

- Chrome/Edge 可执行文件可能安装在 C 盘。
- Windows 页面文件、系统日志、崩溃报告或安全软件记录不受网页控制。
- 用户用默认浏览器打开本地网址时，默认 Profile 的 OPFS 仍可能位于 C 盘。
- 用户主动修改下载设置或在“另存为”中选择 C 盘时，脚本不会越权阻止。

网页无法指定任意浏览器的 OPFS 位置。D 盘落点来自启动器显式传入的
`--user-data-dir`、缓存参数和进程环境，而不是网页代码。
