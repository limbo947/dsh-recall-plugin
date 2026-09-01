// M1 最小占位：CI 不装私有 peerDeps，裸导入需 ambient 声明兜底。
// M3 由 dsh-contract.ts 的完整 declare module 取代，届时删除本文件。
declare module '@deepseek-ai/schemastery'
declare module '@deepseek-ai/dsh-settings'
