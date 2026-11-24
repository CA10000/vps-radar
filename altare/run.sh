#!/bin/bash
cd /opt/radar
set -a
. /opt/radar/.env
set +a
export WECOM_KEY DEEPSEEK_API_KEY
python3 /opt/radar/radar.py
