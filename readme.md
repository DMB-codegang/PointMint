# Koishi Plugin PointMint

[![npm](https://img.shields.io/npm/v/koishi-plugin-pointmint?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-pointmint)
[![License](https://img.shields.io/github/license/DMB-codegang/pointmint?style=flat-square)](LICENSE)

模块化架构 | 高度可定制｜可审计事务追踪｜实时积分生态 - 基于双效校验机制的经济引擎

## 功能特性

### 核心能力
- **双效校验机制**：通过实现事务ID生成与验证，确保每笔积分操作的可追溯性
- **实时积分系统**：提供类实现完整的积分生命周期管理（增/删/查/改）
- **审计追踪体系**：通过记录全量操作日志，支持自定义日志保留策略

### 功能亮点
- 用户积分排行榜（TopN 查询）
- 自动用户名同步机制
- 弹性积分初始化策略
- 操作结果多状态码返回
- 插件间调用追踪标识

## 开发者快速接入指南

> [!NOTE]  
> 正在撰写……

## 接口文档

### 基础数据结构
基础数据结构提供了必要的接口定义，用于实现插件间的交互。

> [!WARNING]  
> - 插件目前还在开发版本，下面的接口在接下来的版本中可能会有变动
>
> - 为了方便称呼，以下文档中有关于虚拟货币的称呼统一为“积分”，您可以设置您的货币为其他任意名称
> 
> - 如果你在使用过程中遇到了问题，欢迎提交[Issue](URL_ADDRESS.com/DMB-codegang/pointmint/issues)

```typescript
export interface ApiResponseNoData {
    code: number // 状态码
    msg: string // 状态信息
}
```
### 状态码表


| 状态码 | 状态信息 | 说明 |
|---|---|---|
| 200 | 成功 | 操作成功 |
| 204 | 成功 | 操作成功，但是操作没有实质性改变数据 |
| 400 | 错误 | 操作失败，参数有误 |
| 403 | 错误 | 操作失败，用户没有足够的积分用于操作 |
| 500 | 错误 | 操作失败，服务器内部错误，可能是配置项错误或bug |

### 1. 积分查询

1. 设置积分
```typescript
async set(
  userid: string, // 用户唯一标识符
  transactionId: string, // 事务id，见第二节
  points: number, // 积分值，必须 >= 0
  pluginName?: string // 插件名，用于追踪调用关系
): Promise<ApiResponseNoData>
```

2. 增加积分
```typescript
async add(
  userid: string,
  transactionId: string,
  points: number,
  pluginName?: string
): Promise<ApiResponseNoData>
 ```

3. 扣除积分
```typescript
async reduce(
  userid: string,
  transactionId: string,
  points: number,        // 必须 > 0
  pluginName?: string
): Promise<ApiResponseNoData>
 ```

5. 获取积分排行
```typescript
async getTopN(
  num: number  // 需要查询的排行榜名额数量，必须为正整数
): Promise<Array<{
  userid: string   // 用户唯一标识符
  username: string // 用户当前名称
  points: number   // 用户当前积分
}>>
// 返回示例
[
    { userid: '123456', username: 'Alice', points: 100},
    { userid: '654321', username: 'Bob', points: 90}
]
 ```

 ### 2. 获取事务id
 事务id是用于操作积分的必要数值，对积分进行操作的方法都需要传入事务id。
 你可以通过以下方法获取事务id：
 ```typescript
 async generateTransactionId(): Promise<string>
 ```

 ### 3. 其他方法
 
1. 更新用户名
```typescript
async updateUserName(
  userid: string,
  username: string,
  pluginName?: string
): Promise<ApiResponseNoData>
 ```

 2. 回写操作
 回写操作是将某项操作回写。例如，你通过reduce方法后，所要提供的服务未能正常提供，可以通过该方法回退
```typescript
async rollback(
  userid: string,
  transactionId: string,
  pluginName?: string
): Promise<ApiResponseNoData>
 ```