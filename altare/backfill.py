#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
补审积压条目：把 data.json 里未审核的条目分批送 AI
用法: python3 backfill.py [每批数量，默认50]
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime

sys.path.insert(0, "/opt/radar")
from radar import ai_review, log, DEEPSEEK_KEY, REPO_DIR  # noqa

DATA = os.path.join(REPO_DIR, "docs", "data.json")
BATCH = int(sys.argv[1]) if len(sys.argv) > 1 else 50


def main():
    if not DEEPSEEK_KEY:
        log("未配置 DEEPSEEK_API_KEY")
        return

    with open(DATA, "r", encoding="utf-8") as f:
        data = json.load(f)

    items = data.get("items", [])
    pending = [i for i in items if not i.get("ai")]
    log("总条目 %d，未审核 %d，本批处理 %d" % (len(items), len(pending), min(BATCH, len(pending))))

    if not pending:
        log("无待审条目")
        return

    done = 0
    for it in pending[:BATCH]:
        try:
            # 适配 ai_review 需要的字段（仓库数据用 source_name）
            item = dict(it)
            item["source"] = it.get("source_name") or it.get("source_id") or "未知"
            r = ai_review(item)
            if not r:
                continue
            it["ai"] = {
                "is_server": r.get("is_server", False),
                "is_free": r.get("is_free", False),
                "confidence": r.get("confidence", 0),
                "real_free": r.get("real_free", ""),
                "cost": "",
                "risks": r.get("risks", ""),
                "tag": r.get("kind", ""),
            }
            done += 1
            mark = "✅" if (r.get("is_free") and r.get("is_server")) else "  "
            log("  %s %s" % (mark, it.get("title", "")[:55]))
            time.sleep(0.35)
        except Exception as e:
            log("  失败: %s" % str(e)[:80])

    # 保存
    try:
        with open(DATA, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        log("已保存，本批审核 %d 条" % done)
    except Exception as e:
        log("保存失败: %s" % e)

    # 统计
    total_ai = len([i for i in data["items"] if i.get("ai")])
    log("累计已审核 %d/%d (%.0f%%)" % (
        total_ai, len(data["items"]), total_ai / len(data["items"]) * 100))


if __name__ == "__main__":
    main()
