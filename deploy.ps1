# ==============================================
#  NavyNavi 自动提交 & 部署脚本
#  用法:
#    .\deploy.ps1                    # 使用自动生成的 commit message
#    .\deploy.ps1 "修复了 console"    # 自定义 commit message
#    .\deploy.ps1 -SkipTests          # 跳过构建测试
# ==============================================
param(
    [string]$Message,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  NavyNavi 自动部署脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---------- Step 1: 检查工作区状态 ----------
Write-Host "[1/5] 检查工作区状态..." -ForegroundColor Yellow
$status = git status --porcelain
if (-not $status) {
    Write-Host "  没有变更，无需提交。" -ForegroundColor Green
    Write-Host ""
    Write-Host "[5/5] 已是最新，跳过部署。" -ForegroundColor Green
    exit 0
}
Write-Host "  发现以下变更:" -ForegroundColor Gray
git status --short
Write-Host ""

# ---------- Step 2: 可选构建测试 ----------
if (-not $SkipBuild) {
    Write-Host "[2/5] 构建测试 (vite build)..." -ForegroundColor Yellow
    Push-Location $PSScriptRoot
    try {
        npx vite build 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  构建失败！请修复错误后重试。" -ForegroundColor Red
            Pop-Location
            exit 1
        }
        Write-Host "  构建通过。" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "[2/5] 跳过构建测试 (--SkipBuild)。" -ForegroundColor DarkYellow
}
Write-Host ""

# ---------- Step 3: 生成 commit message ----------
Write-Host "[3/5] 准备提交..." -ForegroundColor Yellow
if (-not $Message) {
    $date = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "deploy: auto commit at $date"
    Write-Host "  未指定 message，自动生成: $Message" -ForegroundColor Gray
}
else {
    Write-Host "  Commit message: $Message" -ForegroundColor Gray
}
Write-Host ""

# ---------- Step 4: Git add + commit ----------
Write-Host "[4/5] 执行 git add & commit..." -ForegroundColor Yellow
git add -A
git commit -m $Message
Write-Host "  提交成功。" -ForegroundColor Green
Write-Host ""

# ---------- Step 5: Git push -> 触发 Vercel 部署 ----------
Write-Host "[5/5] 推送代码并触发 Vercel 部署..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "  推送失败！请检查网络或远程仓库状态。" -ForegroundColor Red
    exit 1
}
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  推送成功！Vercel 将自动检测并部署。" -ForegroundColor Green
Write-Host "  请到 Vercel Dashboard 查看部署进度:" -ForegroundColor Green
Write-Host "  https://vercel.com/dashboard" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
