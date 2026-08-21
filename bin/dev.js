#!/usr/bin/env node
import { register } from 'tsx/esm/api';
import { execute } from '@oclif/core';

// 按本文件位置解析 tsx，避免从仓库根目录启动时 --import 找不到包
register();
await execute({ development: true, dir: import.meta.url });
