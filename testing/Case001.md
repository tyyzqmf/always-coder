# Case001: Session 重连测试

## 测试目的
验证 CLI session 在 web 端断开连接后能够保持运行，并支持重新连接。

## 环境信息

| 配置项 | 值 |
|--------|-----|
| Web URL | `<YOUR_WEB_URL>` |
| WebSocket | `<YOUR_WEBSOCKET_URL>` |
| Cognito Region | `<YOUR_REGION>` |
| CLI 版本 | >= 1.1.1 |

> 注意：部署完成后，可通过 `cd infra && pnpm cdk deploy --all` 输出获取实际地址

## 前置条件
1. 已在 Cognito 中创建测试用户
2. Node.js >= 20.0.0

## 测试步骤

### Step 1: 安装最新版 CLI
```bash
npm install -g @always-coder/cli@latest
always --version
```
**预期结果**: 显示版本 >= `1.1.1`

### Step 2: 登录服务器
```bash
always login --server <YOUR_WEBSOCKET_URL>
```
**预期结果**: 提示输入用户名和密码，登录成功后显示 "Login successful"

### Step 3: 以 daemon 模式启动 Claude
```bash
always claude -d
```
**预期结果**:
- 显示 session ID 和连接信息
- 显示 QR code
- 显示 web 连接 URL

### Step 4: 浏览器访问 Web 端
1. 打开浏览器访问 `<YOUR_WEB_URL>`
2. 使用 Cognito 账户登录

**预期结果**: 登录成功，显示 session 列表

### Step 5: 连接 Session
点击 Step 3 中显示的 session 或扫描 QR code

**预期结果**:
- 成功连接到终端
- 显示 Claude 界面

### Step 6: 完成一轮对话
在 web 终端中输入测试提示词，等待 Claude 响应

**预期结果**: Claude 正常响应

### Step 7: 测试 Ctrl+C 信号过滤
在 web 终端中按 `Ctrl+C`

**预期结果**:
- CLI 端显示 "Blocked control signals from web: SIGINT"
- Session 保持运行，不会终止
- 可以继续输入

### Step 8: 关闭浏览器标签页
直接关闭浏览器标签页或刷新页面

**预期结果**:
- CLI 端 session 保持运行
- 可以通过 `always list` 查看 session 仍然存在

### Step 9: 重新连接 Session
1. 重新打开浏览器访问 `<YOUR_WEB_URL>`
2. 在 session 列表中找到之前的 session
3. 点击连接

**预期结果**:
- 成功重新连接到同一个 session
- 可以看到之前的对话历史（取决于终端缓冲区）

### Step 10: 继续对话
在重新连接的 session 中继续输入提示词

**预期结果**: Claude 正常响应，session 功能完整

### Step 11: 停止 Session
```bash
always stop --all
```
**预期结果**: 所有 daemon session 停止

### Step 12: 删除测试用户
通过 AWS Console 或 CLI 删除 Cognito 测试用户：
```bash
aws cognito-idp admin-delete-user \
  --user-pool-id <YOUR_USER_POOL_ID> \
  --username <TEST_USERNAME>
```
**预期结果**: 测试用户已从 Cognito User Pool 中删除

## 测试结果

| 步骤 | 结果 | 备注 |
|------|------|------|
| Step 1 |  |  |
| Step 2 |  |  |
| Step 3 |  |  |
| Step 4 |  |  |
| Step 5 |  |  |
| Step 6 |  |  |
| Step 7 |  |  |
| Step 8 |  |  |
| Step 9 |  |  |
| Step 10 |  |  |
| Step 11 |  |  |
| Step 12 |  |  |
