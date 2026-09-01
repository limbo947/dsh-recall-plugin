// 私有 peer 包 ambient 声明（事实来源：docs/dsh-contract.md §1.1；字段以官方
// 源码为准，本文件是「依赖面」类型源的组成部分——类型面见 dsh-contract.ts）。
//
// 必须独立成无 import/export 的全局 .d.ts：TS 规定 `declare module` 在带顶层
// import 的模块文件里是 module augmentation（禁 export 新符号，TS2666），
// 环境模块声明只能住在脚本上下文文件。CI 不装私有 peerDeps，裸导入的类型
// 兜底只能由 ambient 提供。

declare module '@deepseek-ai/schemastery' {
  export interface SchemaChain<T> {
    default(value: T): SchemaChain<T>
    description(text: string): SchemaChain<T>
  }
  export interface SchemaObject<T extends Record<string, unknown>> {
    // 运行时是活 schema 实例（cordis 校验 + settings 注册双角色），
    // 类型侧只声明消费面需要的最小形状
  }
  export interface SchemaFactory {
    object<T extends Record<string, unknown>>(shape: T): SchemaObject<T>
    number(): SchemaChain<number>
    string(): SchemaChain<string>
    array<T>(item: SchemaChain<T>): SchemaChain<T[]>
    boolean(): SchemaChain<boolean>
  }
  const Schema: SchemaFactory
  export default Schema
}

declare module '@deepseek-ai/dsh-settings' {
  // 0.1.1-rc.2 及以前的独立函数辅助（0.1.2-alpha.2 起被官方移除，仅历史记录）
  export function installSettingsSection<T>(
    ctx: unknown,
    ns: string,
    schema: unknown,
    entry: T,
    hooks: { setSource(fn: () => T): void; onChange(): void }
  ): void
}
