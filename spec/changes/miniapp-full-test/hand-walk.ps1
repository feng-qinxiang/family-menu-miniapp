$ErrorActionPreference = 'Continue'
$cli = 'E:\rjd\微信开发者工具\wechatide.cmd'
$proj = 'E:\cx\点菜小程序-家庭版'
$outDir = Join-Path $proj 'spec\changes\miniapp-full-test\hand-shots'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$logPath = Join-Path $proj 'spec\changes\miniapp-full-test\hand-walk.jsonl'
if (Test-Path $logPath) { Remove-Item $logPath }

function Invoke-Ide([string]$Tool, [string[]]$ArgList) {
  $argLine = ($ArgList | ForEach-Object {
    if ($_ -match '[\s]') { '"{0}"' -f $_ } else { $_ }
  }) -join ' '
  $raw = & cmd /c "`"$cli`" -c Cursor $Tool $argLine" 2>&1 | Out-String
  $json = $null
  $m = [regex]::Matches($raw, '(?s)\{(?:[^{}]|(?<open>\{)|(?<-open>\}))+(?(open)(?!))\}')
  if ($m.Count -eq 0) {
    $m = [regex]::Matches($raw, '(?s)\{.*\}')
  }
  if ($m.Count -gt 0) {
    try { $json = $m[$m.Count - 1].Value | ConvertFrom-Json } catch { $json = $null }
  }
  return @{ raw = $raw; json = $json }
}

function Get-Result($pack) {
  if (-not $pack.json) { return $null }
  if ($pack.json.result) { return $pack.json.result }
  return $pack.json
}

$pages = @(
  @{ page = 'pages/home/index'; tap = '.mh-hero-add' }
  @{ page = 'pages/recipes/index'; tap = '.rx-create' }
  @{ page = 'pages/menu/index'; tap = '.m-nav-add' }
  @{ page = 'pages/me/index'; tap = '.mag-vip' }
  @{ page = 'pages/shopping/index'; tap = '.sp-seg-item' }
  @{ page = 'pages/community/index'; tap = '.empty-retry' }
  @{ page = 'pages/import/index'; tap = '.imp-method-main' }
  @{ page = 'pages/recipe-detail/index'; query = 'id=1'; tap = '.rd-primary-btn' }
  @{ page = 'pages/recipe-edit/index'; tap = '.rc-addrow' }
  @{ page = 'pages/vip/index' }
  @{ page = 'pages/weekly-menu/index'; tap = '.wm-dish' }
  @{ page = 'pages/pantry/index'; tap = '.addcard' }
  @{ page = 'pages/recipes/search/index' }
  @{ page = 'pages/cook-mode/index'; query = 'id=1'; tap = '.btn.next' }
  @{ page = 'pages/cook-log/index'; tap = '.chip' }
  @{ page = 'pages/community/post-detail/index'; query = 'postId=3' }
  @{ page = 'pages/community/audit/index' }
  @{ page = 'pages/auth/login/index'; tap = '.agree' }
  @{ page = 'pages/auth/login-phone/index' }
  @{ page = 'pages/auth/verify-otp/index' }
  @{ page = 'pages/auth/register/index' }
  @{ page = 'pages/auth/reset-password/index'; tap = '.rp-backlink-a' }
  @{ page = 'pages/auth/wechat-auth/index' }
  @{ page = 'pages/family/create/index'; tap = '.fc-join-a' }
  @{ page = 'pages/family/join/index' }
  @{ page = 'pages/family/members/index' }
  @{ page = 'pages/family/invite/index' }
  @{ page = 'pages/vip/upgrade/index' }
  @{ page = 'pages/vip/orders/index' }
  @{ page = 'pages/payment/checkout/index' }
  @{ page = 'pages/payment/success/index' }
  @{ page = 'pages/me/favorites/index' }
  @{ page = 'pages/me/profile-edit/index' }
  @{ page = 'pages/me/settings/index' }
  @{ page = 'pages/me/notifications/index' }
  @{ page = 'pages/me/preference-profile/index' }
  @{ page = 'pages/me/feedback/index' }
  @{ page = 'pages/me/help-faq/index' }
  @{ page = 'pages/me/about/index' }
  @{ page = 'pages/legal/terms/index' }
  @{ page = 'pages/legal/privacy/index' }
  @{ page = 'pages/showcase/index'; tap = '.sc-head-cta' }
)

$i = 0
foreach ($item in $pages) {
  $i++
  $slug = ($item.page -replace '/', '-')
  $shot = Join-Path $outDir ("{0:D2}-{1}.jpg" -f $i, $slug)
  $openArgs = @('--project', $proj, '--page', $item.page)
  if ($item.query) { $openArgs += @('--query', $item.query) }
  $opened = Invoke-Ide 'simulator_open_page' $openArgs
  $openRes = Get-Result $opened
  Start-Sleep -Milliseconds 800
  $cur = Get-Result (Invoke-Ide 'automation_runtime_info' @('--project', $proj, '--action', 'currentPage'))
  $shotRes = Get-Result (Invoke-Ide 'simulator_screenshot' @('--project', $proj, '--path', $shot, '--wait', '0.3'))
  $afterPath = $null
  $tapOk = $null
  if ($item.tap) {
    $tapRes = Get-Result (Invoke-Ide 'automation_element_action' @('--project', $proj, '--action', 'tap', '--selector', $item.tap, '--wait', '0.2'))
    $tapOk = [bool]$tapRes.success
    Start-Sleep -Milliseconds 600
    $after = Get-Result (Invoke-Ide 'automation_runtime_info' @('--project', $proj, '--action', 'currentPage'))
    $afterPath = $after.currentPage.path
  }
  $row = [ordered]@{
    n = $i
    page = $item.page
    query = $item.query
    openOk = [bool]$openRes.success
    current = $cur.currentPage.path
    title = $cur.currentPage.title
    tap = $item.tap
    tapOk = $tapOk
    after = $afterPath
    shotOk = [bool]$shotRes.success
    shot = $shotRes.path
  }
  ($row | ConvertTo-Json -Compress) | Add-Content -Path $logPath -Encoding utf8
  Write-Output ("{0:D2} {1} current={2} tap={3} after={4} shot={5}" -f $i, $item.page, $row.current, $row.tapOk, $row.after, $row.shotOk)
}

Write-Output "DONE $logPath"
