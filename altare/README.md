# Altare 部署备份

这是自动备份的核心脚本，用于服务器重置后快速恢复。

## 恢复步骤

```bash
# 1. 在新服务器上
mkdir -p /opt/radar
cd /opt/radar

# 2. 拉取备份
git clone https://github.com/CA10000/vps-radar.git repo
cp repo/altare/*.py repo/altare/*.sh /opt/radar/
chmod +x /opt/radar/*.sh

# 3. 配置环境变量
cat > /opt/radar/.env << 'ENVEOF'
WECOM_KEY=你的企业微信key
DEEPSEEK_API_KEY=你的deepseek key
ENVEOF
chmod 600 /opt/radar/.env

# 4. 生成新的 deploy key 并添加到 GitHub
ssh-keygen -t ed25519 -f /opt/radar/deploy_key -N ''
cat /opt/radar/deploy_key.pub
# 把公钥粘贴到仓库 Settings -> Deploy keys，勾选 Allow write access

# 5. 配置 git
cat > /root/.ssh/config << 'SSHEOF'
Host github.com
  HostName github.com
  User git
  IdentityFile /opt/radar/deploy_key
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
SSHEOF
chmod 600 /root/.ssh/config

# 6. 启动
/opt/radar/start.sh
```

最后更新时间：见 git 提交记录
