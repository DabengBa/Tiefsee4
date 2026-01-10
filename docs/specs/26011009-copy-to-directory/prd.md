# 复制到目录功能 PRD

## 功能概述

为 Tiefsee 图片浏览器添加「复制到目录」功能：用户可配置目标目录与快捷键（支持单键与组合键）。在浏览图片时按快捷键，程序将当前图片（或 Bulk View 多选的图片）复制到目标目录，用于“挑选-收集-归档”的高频流程提效。

与「复制到剪贴板」不同，本功能面向“连续收集多个文件”的场景：每次触发都会直接落盘到目标目录，并提供清晰的成功/失败反馈。

## 用户故事

### 主要用户
- 图片整理者：需要快速收集和分类图片的用户
- 设计师：浏览大量设计素材并需要快速保存到特定文件夹
- 内容创作者：在浏览图片时需要快速归档素材

### 用户场景
1. **快速归档场景**：用户浏览网络图片库，发现需要的素材，按快捷键直接复制到项目文件夹
2. **分类整理场景**：用户浏览本地图片文件夹，按快捷键将图片复制到不同分类文件夹
3. **批量收集场景**：用户连续浏览多张图片，通过快捷键快速复制所有需要的图片到目标目录

### 用户痛点
- 现有"复制到剪贴板"功能只能存储一个项目，无法连续复制多张图片
- 手动拖拽或右键复制操作繁琐，影响浏览效率
- 需要频繁切换窗口进行文件管理操作

## 功能需求

### 核心功能
1. **快捷键配置**
   - 作用范围：**仅在 Tiefsee 窗口聚焦时生效**（非全局系统热键）
   - 支持单键（如 `F1`）与组合键（如 `Ctrl+Alt+D`）
   - 支持检测快捷键冲突（与 Tiefsee 内置快捷键/已有可配置快捷键冲突时给出提示并阻止保存）
   - 快捷键可随时修改、清空或禁用（禁用后快捷键不生效）

2. **目标目录设置**
   - 用户可设置目标目录路径
   - 提供系统目录选择器选择目录（避免手动输入错误）
   - 允许手动输入/粘贴路径（便于网络路径、复制粘贴）
   - 支持相对路径和绝对路径
   - 支持网络路径（UNC路径）

3. **文件复制操作**
   - 触发时复制：
     - 普通浏览模式：复制当前显示的图片
     - Bulk View：若存在多选，则批量复制多选的图片；否则复制当前聚焦/当前项（需定义）
   - **若当前图片存在旋转/缩放等显示变更**：先弹窗提示“需要先保存”，用户确认后先保存（导出）再复制保存后的内容
   - 不需要支持“复制视频帧”
   - 默认保持原文件名不变；若发生同名冲突按配置策略处理
   - 支持所有图片格式（jpg, png, gif, webp, bmp等）
   - 异步执行，不阻塞UI线程

4. **操作反馈**
   - 复制成功：Toast 显示**目标目录 + 最终文件名**
   - 复制失败：Toast 显示失败原因（如目标目录不可写、磁盘空间不足、路径无效等）
   - 批量复制：Toast 显示成功/失败数量与目标目录（可选展示首个失败原因）

5. **Bulk View 多选与批量复制**
   - 支持多选：`Ctrl+点击` 切换选择，`Shift+点击` 区间选择（需定义选择范围与行为）
   - 多选存在时，快捷键触发批量复制；多选为空时回退到“复制当前项”
   - 提供“清空选择”的入口（例如 ESC/按钮，具体交互后续确定）

### 高级功能
1. **冲突处理策略**
   - 覆盖：直接覆盖同名文件
   - 重命名（默认）：**时间戳重命名**（如 `image_20260110_153012_123.jpg`）
   - 跳过：不复制同名文件

2. **目录自动创建**
   - 目标目录不存在时自动创建（可选）
   - 创建失败时提示用户

3. **功能开关**
   - 可完全禁用该功能
   - 禁用后快捷键不生效

## 非功能需求

### 性能要求
- 文件复制操作必须在100ms内开始执行（避免UI卡顿）
- 大文件（>10MB）复制时提供进度提示（可选）
- 快捷键响应延迟<50ms

### 可用性要求
- 快捷键必须可自定义，适应不同用户习惯
- 操作必须有明确反馈（成功/失败）
- 错误信息必须用户友好，提供解决建议

### 可靠性要求
- 所有文件操作必须有异常处理
- 目标目录不可写时必须明确提示
- 磁盘空间不足时必须提前检测并提示

### 兼容性要求
- 支持Windows文件系统（NTFS, FAT32）
- 支持网络路径
- 支持特殊字符路径（中文、空格等）

## 技术实现方案

### 配置结构设计

```typescript
// Config.ts 扩展
public settings = {
    // ... 现有配置
    copyToDirectory: {
        enabled: boolean,              // 功能开关，默认false
        targetPath: string,             // 目标目录路径，默认空字符串
        shortcut: string,               // 快捷键，默认"F1"；支持 "Ctrl+Alt+D"
        onConflict: "overwrite" | "renameTimestamp" | "skip", // 冲突处理策略，默认"renameTimestamp"
        createDirIfNotExists: boolean,  // 自动创建目录，默认true
        requireSaveWhenTransformed: boolean, // 存在旋转/缩放变更时先提示保存，默认true
    }
}
```

### 快捷键处理

在 [Hotkey.ts](file:///e:/Wechat%20work/Tiefsee4/Www/ts/MainWindow/Hotkey.ts) 中添加新的快捷键监听：

```typescript
// 在 window.addEventListener("keydown", ...) 中添加
// 需支持单键与组合键匹配，且避免在输入框/文字选择时误触发
if (config.settings.copyToDirectory.enabled
    && Shortcut.match(e, config.settings.copyToDirectory.shortcut)
    && Lib.isTxtSelect() === false
) {
    M.script.copy.copyToDirectory();
}
```

### 文件复制实现（含批量与时间戳重命名）

在 [Script.ts](file:///e:/Wechat%20work/Tiefsee4/Www/ts/MainWindow/Script.ts) 的 ScriptCopy 类中添加新方法：

```typescript
/** 复制到目录 */
public async copyToDirectory(path?: string) {
    const config = this.M.config.settings.copyToDirectory;
    
    // 检查功能是否启用
    if (!config.enabled) {
        return;
    }

    // 获取待复制的路径列表：Bulk View 多选优先，否则单文件
    const paths = this.M.fileLoad.getIsBulkView()
        ? this.M.bulkView.getSelectedPathsOrCurrent()
        : [this.M.fileLoad.getFilePath()];
    
    // 验证目标目录
    const targetPath = config.targetPath;
    if (!targetPath) {
        Toast.show(this.M.i18n.t("msg.targetPathNotSet"), 3000);
        return;
    }
    
    // 检查目标目录是否存在
    const dirExists = await WV_Directory.Exists(targetPath);
    if (!dirExists) {
        if (config.createDirIfNotExists) {
            await WV_Directory.CreateDirectory(targetPath);
        } else {
            Toast.show(this.M.i18n.t("msg.targetDirNotExists"), 3000);
            return;
        }
    }
    
    // 逐个复制（批量）
    for (const p of paths) {
        // 验证源文件存在
        if (await WV_File.Exists(p) === false) {
            Toast.show(this.M.i18n.t("msg.fileNotFound") + `: ${p}`, 3000);
            continue;
        }

        // 若存在旋转/缩放变更：提示保存（导出）后再复制保存后的内容
        const sourcePath = await this.resolveCopySourcePath(p, config.requireSaveWhenTransformed);

        // 构建目标文件路径 + 冲突处理（默认时间戳重命名）
        const fileName = Lib.getFileName(sourcePath);
        let targetFilePath = Lib.combine([targetPath, fileName]);
        targetFilePath = await this.resolveConflictPath(targetFilePath, config.onConflict);

        // 执行复制操作
        const err = await WV_File.Copy(sourcePath, targetFilePath, /*overwrite*/ config.onConflict === "overwrite");
        if (err === "") {
            Toast.show(this.M.i18n.t("msg.copyToDirSuccess") + `\n${targetFilePath}`, 3000);
        } else {
            Toast.show(this.M.i18n.t("msg.copyToDirFailed") + `\n${err}`, 5000);
        }
    }
}
```

### 设置界面

在 [SettingWindow.ts](file:///e:/Wechat%20work/Tiefsee4/Www/ts/SettingWindow/SettingWindow.ts) 中添加配置UI：

```typescript
// 添加"复制到目录"设置面板
{
    title: "复制到目录",
    items: [
        {
            type: "checkbox",
            key: "copyToDirectory.enabled",
            label: "启用功能"
        },
        {
            type: "text",
            key: "copyToDirectory.targetPath",
            label: "目标目录",
            placeholder: "选择目标目录...",
            button: "浏览..."
        },
        {
            type: "text",
            key: "copyToDirectory.shortcut",
            label: "快捷键",
            placeholder: "例如：F1 / Ctrl+Alt+D"
        },
        {
            type: "select",
            key: "copyToDirectory.onConflict",
            label: "同名文件处理",
            options: [
                { value: "renameTimestamp", label: "时间戳重命名（默认）" },
                { value: "overwrite", label: "覆盖" },
                { value: "skip", label: "跳过" }
            ]
        },
        {
            type: "checkbox",
            key: "copyToDirectory.createDirIfNotExists",
            label: "目录不存在时自动创建"
        },
        {
            type: "checkbox",
            key: "copyToDirectory.requireSaveWhenTransformed",
            label: "图片有旋转/缩放变更时先提示保存"
        }
    ]
}
```

### 国际化支持

在 [lang/langData.js](file:///e:/Wechat%20work/Tiefsee4/Www/lang/langData.js) 中添加多语言文本：

```javascript
msg: {
  copyToDirSuccess: {
    "zh-TW": "已複製到目錄：{fileName}\\n{dirPath}",
    "zh-CN": "已复制到目录：{fileName}\\n{dirPath}",
    "en": "Copied to directory: {fileName}\\n{dirPath}",
  },
  copyToDirBatchSuccess: {
    "zh-TW": "已複製 {ok}/{total} 個檔案到：\\n{dirPath}",
    "zh-CN": "已复制 {ok}/{total} 个文件到：\\n{dirPath}",
    "en": "Copied {ok}/{total} files to:\\n{dirPath}",
  },
  copyToDirFailed: {
    "zh-TW": "複製失敗：{reason}",
    "zh-CN": "复制失败：{reason}",
    "en": "Copy failed: {reason}",
  },
  copyToDirNeedSaveConfirm: {
    "zh-TW": "偵測到圖片有旋轉/縮放等變更，需要先保存後再複製。是否保存並繼續？",
    "zh-CN": "检测到图片有旋转/缩放等变更，需要先保存后再复制。是否保存并继续？",
    "en": "Image has transformations (rotate/zoom). Save first before copying. Continue?",
  },
  fileNotFound: {
    "zh-TW": "找不到檔案",
    "zh-CN": "找不到文件",
    "en": "File not found",
  },
  targetPathNotSet: {
    "zh-TW": "未設置目標目錄",
    "zh-CN": "未设置目标目录",
    "en": "Target directory not set",
  },
  targetDirNotExists: {
    "zh-TW": "目標目錄不存在",
    "zh-CN": "目标目录不存在",
    "en": "Target directory does not exist",
  },
  fileSkipped: {
    "zh-TW": "已跳過同名檔案",
    "zh-CN": "已跳过同名文件",
    "en": "Skipped duplicate file",
  },
  shortcutConflict: {
    "zh-TW": "快捷鍵已被占用：{shortcut}",
    "zh-CN": "快捷键已被占用：{shortcut}",
    "en": "Shortcut is already in use: {shortcut}",
  },
}
```

## 边缘情况处理

### 1. 目标目录不存在
- **处理策略**：根据`createDirIfNotExists`配置决定
- **用户提示**：创建成功或失败时显示Toast
- **错误处理**：捕获权限不足、路径无效等异常

### 2. 目标目录不可写
- **检测方法**：尝试创建临时文件
- **用户提示**：显示明确的错误信息和建议
- **错误处理**：不执行复制，提示用户检查权限

### 3. 同名文件冲突
- **处理策略**：根据`onConflict`配置（覆盖/重命名/跳过）
- **重命名规则**（默认时间戳）：`{baseName}_{yyyyMMdd_HHmmss_fff}{ext}`；若仍冲突则追加 `_1/_2...`
- **用户提示**：跳过时显示提示

### 4. 磁盘空间不足
- **检测方法**：复制前检查目标磁盘剩余空间
- **用户提示**：显示"磁盘空间不足"错误
- **错误处理**：不执行复制

### 5. 快捷键冲突
- **检测方法**：在设置时检查与现有快捷键是否冲突
- **用户提示**：显示"快捷键已被占用"警告
- **处理策略**：阻止保存或提示用户确认

### 6. 网络路径延迟
- **处理策略**：异步执行，不阻塞UI
- **用户反馈**：显示"正在复制..."提示（可选）
- **超时处理**：设置超时时间（如30秒）

### 7. 大文件复制
- **处理策略**：异步执行，提供进度反馈（可选）
- **用户反馈**：显示进度条或百分比
- **取消支持**：允许用户取消操作（可选）

### 8. 源文件被占用
- **检测方法**：捕获文件访问异常
- **用户提示**：显示"文件正在使用中"错误
- **错误处理**：不执行复制

### 9. 路径包含特殊字符
- **处理策略**：使用Lib.combine()构建路径，自动处理特殊字符
- **测试覆盖**：中文、空格、特殊符号等

### 10. 功能未启用
- **处理策略**：快捷键不响应
- **用户提示**：无（静默失败）
- **配置检查**：在快捷键处理时检查enabled状态

### 11. 图片存在旋转/缩放变更
- **检测方法**：检测当前视图变换状态（旋转角度/镜像/缩放倍率/剪裁等）
- **处理策略**：根据 `requireSaveWhenTransformed` 弹窗提示保存；用户确认后先保存（导出）再复制
- **用户提示**：确认弹窗 + 成功/失败 Toast（失败提示原因）

### 12. Bulk View 多选为空
- **处理策略**：回退到复制当前项（需定义“当前项”的规则：聚焦项/最后点击项/当前页中心项）

## 验收标准

### 功能验收
- [ ] 用户可在设置中配置目标目录路径
- [ ] 用户可自定义快捷键（默认F1），支持单键与组合键（如 Ctrl+Alt+D）
- [ ] 快捷键仅在 Tiefsee 窗口聚焦时生效
- [ ] 快捷键冲突检测生效：冲突时提示并阻止保存
- [ ] 普通浏览模式：按快捷键可复制当前图片到目标目录
- [ ] Bulk View：支持多选并批量复制到目标目录
- [ ] 图片存在旋转/缩放等变更时，会先提示保存，确认后复制保存后的内容
- [ ] Toast 成功提示包含目标目录与最终文件名；失败提示包含失败原因
- [ ] 功能可完全禁用

### 边缘情况验收
- [ ] 目标目录不存在时根据配置自动创建或提示错误
- [ ] 目标目录不可写时显示明确错误信息
- [ ] 同名文件冲突时根据配置正确处理（覆盖/重命名/跳过）
- [ ] 默认重命名策略为“时间戳重命名”
- [ ] 磁盘空间不足时提前检测并提示
- [ ] 快捷键冲突时显示警告
- [ ] 网络路径正常工作
- [ ] 大文件复制不阻塞UI

### 性能验收
- [ ] 快捷键响应延迟<50ms
- [ ] 文件复制操作在100ms内开始执行
- [ ] 复制操作不导致UI卡顿

### 可用性验收
- [ ] 错误信息用户友好，提供解决建议
- [ ] 操作反馈及时明确
- [ ] 配置界面直观易用

### 兼容性验收
- [ ] 支持所有图片格式
- [ ] 支持相对路径和绝对路径
- [ ] 支持网络路径
- [ ] 支持路径包含特殊字符

## 后续优化方向

### 短期优化
1. 添加复制历史记录（显示最近复制的文件）
2. 添加快捷键录制功能（直接按键而非输入）
3. 批量复制的进度/可取消（针对大文件或网络路径）

### 中期优化
1. 支持多个目标目录（通过不同快捷键或菜单选择）
2. 添加复制模板（支持文件名格式化，如日期、序号等）
3. 添加复制规则（根据文件类型、大小等自动选择目标目录）

### 长期优化
1. 集成云存储（支持复制到OneDrive、Google Drive等）
2. 添加复制统计（显示复制的文件数量、总大小等）
3. 支持复制后自动打开目标目录

## 风险评估

### 技术风险
- **风险**：文件复制操作可能失败（权限、磁盘空间等）
- **缓解**：完善的异常处理和用户提示

### 用户体验风险
- **风险**：快捷键可能与用户习惯冲突
- **缓解**：允许自定义快捷键，提供默认值

### 性能风险
- **风险**：大文件复制可能影响UI响应
- **缓解**：异步执行，提供进度反馈

### 兼容性风险
- **风险**：网络路径可能不稳定
- **缓解**：设置超时时间，提供错误处理

## 参考资料

### 现有代码
- [Hotkey.ts](file:///e:/Wechat%20work/Tiefsee4/Www/ts/MainWindow/Hotkey.ts) - 快捷键处理
- [Config.ts](file:///e:/Wechat%20work/Tiefsee4/Www/ts/Config.ts) - 配置管理
- [Script.ts](file:///e:/Wechat%20work/Tiefsee4/Www/ts/MainWindow/Script.ts) - 文件操作
- [SettingWindow.ts](file:///e:/Wechat%20work/Tiefsee4/Www/ts/SettingWindow/SettingWindow.ts) - 设置界面
- [WebAPI.ts](file:///e:/Wechat%20work/Tiefsee4/Www/ts/WebAPI.ts) - Web API接口
- [WV_File.cs](file:///e:/Wechat%20work/Tiefsee4/Tiefsee/VW/WV_File.cs) - 文件系统操作

### 相关文档
- [Building.md](file:///e:/Wechat%20work/Tiefsee4/Building.md) - 构建文档
- [README.md](file:///e:/Wechat%20work/Tiefsee4/README.md) - 项目说明
