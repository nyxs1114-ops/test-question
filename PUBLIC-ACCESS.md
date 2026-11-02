# 把家里的 Windows 电脑临时分享为公网网站

这里使用 Cloudflare Quick Tunnel：不需要公网 IP、端口转发、自有域名或 Cloudflare 账号；工具会生成随机的 HTTPS 网址。它用于试用，地址可能在重启时更换，不保证可用性。不同网络访问 Cloudflare 的效果不同；若连接失败请提供报错，再选择其他服务。

官方说明：https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/

## 一、保留现有数据，更新代码

先关闭原来的网站窗口，备份整个 data 文件夹。下载最新代码 ZIP，解压到新目录，再把原来的 data 文件夹复制到新目录。不要把现有数据库上传 GitHub，也不要将网站复制到多个位置同时运行。

## 二、安装 Cloudflare 工具（一次即可）

打开 Windows 命令提示符，执行：

```bat
winget install --id Cloudflare.cloudflared --exact
```

按照提示完成安装，然后关闭此命令行窗口。若没有 winget，使用官方 Windows 安装说明：
https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/

也可以从官方发行页 https://github.com/cloudflare/cloudflared/releases 下载与你的电脑架构相符的 Windows 可执行文件。常见 Intel/AMD 64 位电脑使用 windows-amd64.exe，将其改名为 cloudflared.exe，放到项目根目录。不要下载源代码 ZIP，也不要下载不明来源的修改版。

## 三、启动网站，再启动隧道

1. 确保旧的网站窗口已关闭。
2. 双击 start-public-windows.bat，保持窗口打开。
3. 双击 start-tunnel-windows.bat，保持第二个窗口打开。
4. 第二个窗口会显示类似 https://随机字符.trycloudflare.com 的真实网址。等待连接成功后，用浏览器打开它。若暂时打不开，稍后刷新。
5. 从这个 HTTPS 网址登录，并把同一个网址发给朋友。

以上网址只是格式示例，不能直接使用，必须复制你电脑实际生成的链接。公网模式下不要使用 start-windows.bat；它强制使用本地 HTTP 登录配置。公网模式也不要通过 localhost 登录，Secure Cookie 只应通过公网 HTTPS 使用。两个窗口都要保持运行，电脑不得睡眠。

## 四、验收

先用手机关闭 Wi-Fi，改用移动网络打开真实链接。注册一个账号，发布题目并回答；刷新后应仍然登录，能看到题目。随后邀请朋友尝试。如果链接能打开但登录失败，请提供页面错误及两个窗口的报错（隐藏个人信息）。

数据库仍保存在本机 data/app.db。公网网址变化不影响数据库，但浏览器需在新网址重新登录。关闭隧道窗口会停止公网转发；关闭网站窗口会停止服务。停止之后再备份 data 文件夹。

## 常见问题

- Port 3000 is already in use：先关闭原来运行网站的窗口，不要同时双击本地和公网启动文件。
- 不允许的请求来源：确认运行的是 start-public-windows.bat，并通过 HTTPS 隧道网址访问；不要配置将 Host 改为 localhost 的自定义代理选项。
- Cloudflared not found：安装后重新打开启动文件，或将官方 cloudflared.exe 放到项目根目录。
- 隧道无法建立：检查两个窗口报错。无需开放路由器入站端口；某些网络可能限制工具的出站连接。
- 已有 Cloudflare 配置：Quick Tunnel 可能与用户目录下的 .cloudflared/config.yaml 冲突；不要直接删除既有配置，先记录报错再排查。

公网模式仅在后端连接来自本机回环地址时使用 Cloudflare 的 CF-Connecting-IP 做登录限流；不要将 TRUST_CLOUDFLARE=1 用于可直接从外网访问的后端。

这是少量用户试用方案。当前网站尚无管理员审核、举报和密码找回功能；公开推广前需补齐。临时链接不是访问密码，任何拿到链接的人都可以浏览并注册。
