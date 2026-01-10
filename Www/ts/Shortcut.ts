/**
 * Shortcut 快捷键模块
 * 提供快捷键解析、规范化、匹配和冲突检测功能
 */

export interface ShortcutKey {
    key: string;
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
}

export interface ParsedShortcut {
    key: string;
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    normalized: string;
}

function canonicalKeyFromToken(token: string): string {
    if (!token) {
        return '';
    }

    const t = token.trim();
    if (!t) {
        return '';
    }

    const lower = t.toLowerCase();

    if (lower === ' ' || lower === 'space' || lower === 'spacebar') return 'Space';
    if (lower === 'esc' || lower === 'escape') return 'Escape';
    if (lower === 'enter' || lower === 'return') return 'Enter';
    if (lower === 'tab') return 'Tab';
    if (lower === 'backspace') return 'Backspace';
    if (lower === 'delete' || lower === 'del') return 'Delete';

    const fKeyMatch = lower.match(/^f(1[0-2]|[1-9])$/);
    if (fKeyMatch) {
        return `F${fKeyMatch[1]}`;
    }

    if (lower.length === 1) {
        return lower.toUpperCase();
    }

    return '';
}

function canonicalKeyFromEvent(event: KeyboardEvent): string {
    // event.key for Space is usually " " in browsers
    if (event.key === ' ') {
        return 'Space';
    }
    return canonicalKeyFromToken(event.key);
}

/**
 * 解析快捷键字符串
 * @param shortcut 快捷键字符串，如 "ctrl + alt + d"
 * @returns 解析后的快捷键对象
 */
export function parse(shortcut: string): ParsedShortcut {
    if (!shortcut || typeof shortcut !== 'string') {
        return { key: '', ctrl: false, alt: false, shift: false, normalized: '' };
    }

    const parts = shortcut.split('+').map(s => s.trim());
    const result: ParsedShortcut = {
        key: '',
        ctrl: false,
        alt: false,
        shift: false,
        normalized: ''
    };

    for (const part of parts) {
        const lower = part.toLowerCase();
        if (lower === 'ctrl' || lower === 'control') {
            result.ctrl = true;
        } else if (lower === 'alt') {
            result.alt = true;
        } else if (lower === 'shift') {
            result.shift = true;
        } else {
            const key = canonicalKeyFromToken(part);
            if (key) {
                result.key = key;
            }
        }
    }

    result.normalized = normalize(result);
    return result;
}

/**
 * 规范化快捷键
 * @param shortcut 快捷键对象或字符串
 * @returns 规范化后的快捷键字符串，如 "Ctrl+Alt+D"
 */
export function normalize(shortcut: ShortcutKey | string): string {
    const parsed = typeof shortcut === 'string' ? parse(shortcut) : shortcut;
    
    if (!parsed.key) {
        return '';
    }

    const parts: string[] = [];
    if (parsed.ctrl) parts.push('Ctrl');
    if (parsed.alt) parts.push('Alt');
    if (parsed.shift) parts.push('Shift');
    parts.push(parsed.key);

    return parts.join('+');
}

/**
 * 匹配键盘事件与快捷键
 * @param shortcut 快捷键对象或字符串
 * @param event 键盘事件
 * @returns 是否匹配
 */
export function match(shortcut: ShortcutKey | string, event: KeyboardEvent): boolean {
    const parsed = typeof shortcut === 'string' ? parse(shortcut) : shortcut;
    
    if (!parsed.key) {
        return false;
    }

    const eventKey = canonicalKeyFromEvent(event);
    const keyMatch = parsed.key === eventKey;
    const ctrlMatch = parsed.ctrl === (event.ctrlKey || event.metaKey);
    const altMatch = parsed.alt === event.altKey;
    const shiftMatch = parsed.shift === event.shiftKey;

    return keyMatch && ctrlMatch && altMatch && shiftMatch;
}

/**
 * 检测快捷键冲突
 * @param shortcut1 第一个快捷键
 * @param shortcut2 第二个快捷键
 * @returns 是否冲突
 */
export function isConflict(shortcut1: ShortcutKey | string, shortcut2: ShortcutKey | string): boolean {
    const norm1 = normalize(shortcut1);
    const norm2 = normalize(shortcut2);

    if (!norm1 || !norm2) {
        return false;
    }

    return norm1 === norm2;
}

/**
 * 检测快捷键是否与列表中的任何快捷键冲突
 * @param shortcut 要检查的快捷键
 * @param shortcuts 快捷键列表
 * @returns 是否冲突
 */
export function isConflictWithList(shortcut: ShortcutKey | string, shortcuts: (ShortcutKey | string)[]): boolean {
    const norm = normalize(shortcut);
    if (!norm) {
        return false;
    }

    return shortcuts.some(s => {
        const normS = normalize(s);
        return normS && norm === normS;
    });
}
