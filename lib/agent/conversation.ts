import type { FileMap } from "@/lib/types";

// Only complete, unambiguous greetings bypass the model. Mixed requests still
// go to the agent so "你好，帮我加一个按钮" cannot lose the requested change.
export function conversationalReply(prompt: string): string | null {
  if (/^(你好|您好|嗨|哈喽|hello|hi|hey)[！!。.\s]*$/iu.test(prompt.trim()))
    return "你好！我是 Forma，你的应用开发伙伴。告诉我一个想法，我会帮你生成代码，并在右侧展示可以操作的作品。\n\n你可以从这些方向开始：\n• 小游戏：贪吃蛇、2048、记忆翻牌\n• 实用工具：每日打卡、待办清单、灵感收藏夹\n• 展示网站：个人作品集、产品介绍页\n\n直接说“做一个贪吃蛇”就可以开始，也可以补充给谁用、需要哪些功能、喜欢什么风格。做好后，我们还能继续调整交互和样式。";
  return null;
}

export function sameFiles(a: FileMap, b: FileMap): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && a[key] === b[key]);
}
