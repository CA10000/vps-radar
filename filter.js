// 相关度过滤：只保留与「VPS / 云服务器 / 免费额度 / 羊毛」相关的条目
// 对 A、C 类做过滤；B 类（官方免费层页面）不过滤

// 强相关：命中即保留
const KEEP = [
  // 主机/服务器
  /vps/i, /\bvds\b/i, /\bvm\b/i, /服务器/, /主机/, /云服务/, /虚拟主机/, /独立服务器/, /小鸡/,
  // 厂商名
  /\bracknerd\b/i, /\bcloudcone\b/i, /\bbandwagonhost\b/i, /\b搬瓦工\b/, /\bvultr\b/i,
  /\bdigitalocean\b/i, /\blinode\b/i, /\bvultr\b/i, /\bhetzner\b/i, /\bovh\b/i,
  /\bcontabo\b/i, /\bnetcup\b/i, /\bhosthatch\b/i, /\bbuyvm\b/i, /\bdmit\b/i,
  /\brn\b/, /\bcc\b/i, /\bion\b/i, /\bspartanhost\b/i, /\bvirMach\b/i,
  // 免费/价格
  /免费/, /白嫖/, /羊毛/, /\bfree\b/i, /\bfreebie/i, /\bgiveaway\b/i, /免费层/, /free tier/i,
  /\b\d+\s*\$?\s*\/\s*(yr|year|年|mo|month|月)/i, /年付/, /月付/, /优惠/, /促销/, /折扣/, /特价/,
  /便宜/, /低价/, /\bon sale\b/i, /\bdeal/i, /\boffer/i, /\bpromo/i, /优惠码/, /折扣码/,
  /黑五/, /\bblack friday\b/i, /\bcyber monday\b/i, /\bBF\b/,
  // 云平台
  /oracle/i, /\bgcp\b/i, /google cloud/i, /\baws\b/i, /azure/i, /cloudflare/i, /workers/i,
  /\bfly\.io\b/i, /railway/i, /\brender\b/i, /\bvercel\b/i, /\bsupabase\b/i, /\bneon\b/i,
  /阿里云/, /腾讯云/, /华为云/, /甲骨文/,
  // 资源规格
  /\d+\s*[cC]\s*\d+\s*[gG]/i, /\d+\s*核\s*\d+\s*[gG]/i, /内存/, /带宽/, /流量/,
  /续费/, /溢价/, /收一台/, /出一台/, /转让/, /补货/, /库存/, /有货/, /售罄/, /\brestock/i,
  // 技术相关
  /\bipv6\b/i, /\bcn2\b/i, /\bgia\b/i, /\biplc\b/i, /\bbgp\b/i, /\bkvm\b/i, /\blxc\b/i,
  /测评/, /测速/, /延迟/, /回程/, /线路/, /\bping\b/i, /\btcp\b/i, /解锁/,
  // 服务部署
  /\bdocker\b/i, /部署/, /搭建/, /自建/, /\bpanel\b/i, /面板/, /\bssh\b/i, /\bnas\b/i,
];

// 强排除：命中即丢弃（明显无关的闲聊）
const DROP = [
  /黄仁勋/, /英伟达/, /\bnvidia\b/i, /\bgta/i, /魔兽/, /沙丘/, /家园2/, /\brts\b/i,
  /特朗普/, /\btrump\b/i, /董事会/, /股价/, /复职/,
  /claude.*封号/i, /封号.*claude/i, /\bkyc\b/i,
  /招聘/, /求职/, /简历/, /面试/,
  /游戏/, /电影/, /动漫/, /小说/, /音乐/,
  // 敏感/违规内容（账号、黑产、代充）
  /成品号/, /手搓信用卡/, /信用卡注册/, /黑卡/, /代充/, /接码/, /养号/, /号商/,
  /批量出.*token/i, /出.*token.*号/i, /额度号/, /成品账号/,
  // 与 VPS 无关的模型闲聊
  /^你们.*的.*速度怎么样/, /\bneon\b.*速度/, /\bgpt\d?\b.*(拉胯|垃圾|慢)/i,
];

export function isRelevant(item, category) {
  // B 类不过滤（官方页面）
  if (category === "B") return true;

  const text = `${item.title || ""} ${item.summary || ""}`;

  // 先看排除词
  for (const re of DROP) {
    if (re.test(text)) {
      // 例外：如果同时命中很强的 VPS 关键词，仍保留
      const strong = /vps|服务器|云服务|免费层|白嫖|黑五|补货|年付/i.test(text);
      if (!strong) return false;
    }
  }

  // 再看保留词
  for (const re of KEEP) {
    if (re.test(text)) return true;
  }

  return false;
}
