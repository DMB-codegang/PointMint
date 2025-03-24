import { Context, Logger, Service } from 'koishi'

import { LogService } from './logService';
import { PointDB, PointDB_log, ApiResponseNoData } from './types';

import { registerCommands } from './handlers/commands'
import { TransactionIdGenerator } from './core/transaction'

export const name = 'pointmint'
export const description = '模块化架构｜可审计事务追踪｜实时积分生态 - 基于双效校验机制的经济引擎'
const log = new Logger("@DMB-codegang/pointmint");
export const inject = {
  required: ['database']
}
export const database_name = 'PointDB';
export const database_name_log = 'PointDB_log';

import { Config } from './config'
export * from './config'

declare module 'koishi' {
  interface Tables {
    PointDB: PointDB
    PointDB_log: PointDB_log
  }
  interface Context {
    points: PointService
  }
}

export function apply(ctx: Context, cfg: Config) {
  ctx.plugin(PointService, cfg)
  const points = new PointService(ctx, cfg) // 通过实例化解决koishi报inject中没有服务points的警告
  ctx.on('message', async (session) => {
    if (cfg.auto_log_username && cfg.auto_log_username_type === 'all') {
      const username = session.username
      const database_username = await ctx.database.get(database_name, { userid: session.userId })
      if (database_username.length === 0 || database_username[0].username !== username) {
        await points.set(session.userId, username, 0, name)//更新用户名
      }
    }
  })
  registerCommands(ctx, points, cfg)
}

export class PointService extends Service {
  static [Service.provide] = 'points'
  private logService: LogService
  private cfg: Config
  constructor(ctx: Context, cfg: Config) {
    super(ctx, 'points', true)
    // 初始化日志服务
    this.logService = new LogService(ctx, cfg)
    this.cfg = cfg
    ctx.model.extend(database_name, {
      id: 'unsigned',
      userid: 'string',
      username: 'string',
      points: 'integer',
    }, { autoInc: true, primary: 'id' })
    log.info("插件加载成功")
  }

  generateTransactionId = TransactionIdGenerator.generate
  checkTransactionId = TransactionIdGenerator.validate

  // 取得用户积分，用户不存在则返回-1
  async get(userid: string, pluginName?: string): Promise<number> {
    try {
      const row = await this.ctx.database.get(database_name, { userid })
      this.logService.writelog({ userid: userid, operationType: 'get', plugin: pluginName, statusCode: 200 })
      return row.length ? row[0].points : -1
    } catch (error) {
      this.logService.writelog({ userid: userid, operationType: 'get', plugin: pluginName, comment: `调用get时出现错误：${error}`, statusCode: 500 })
      log.error('查询积分失败：' + error)
      throw new Error('查询积分失败：' + error)
    }
  }
  // 设置用户积分，用户不存在则创建
  async set(userid: string, transactionId: string, points: number, pluginName?: string): Promise<ApiResponseNoData> {
    //校验transactionId是否是合法的
    if (TransactionIdGenerator.validate(transactionId) === false) {
      this.logService.writelog({ userid: userid, operationType: 'set', plugin: pluginName, comment: `调用set时出现错误：transactionId无效`, statusCode: 400 })
      return { code: 400, msg: 'transactionId无效' }
    }
    if (points < 0) {
      this.logService.writelog({ userid: userid, operationType: 'set', plugin: pluginName, comment: `调用set时出现错误：积分不能为负数`, statusCode: 400 })
      log.error('设置积分时出现错误：积分不能为负数')
      return { code: 400, msg: '积分不能为负数' }
    }
    try {
      const oldValue = (await this.ctx.database.get(database_name, { userid }))[0]?.points || 0; // 获取旧值
      await this.ctx.database.upsert(database_name, [{ userid, points }], ['userid'])
      this.logService.writelog({ userid: userid, operationType: 'set', plugin: pluginName, statusCode: 200, oldValue: oldValue, transactionId: this.generateTransactionId() })
      return { code: 200, msg: '设置成功' }
    } catch (error) {
      log.error('设置积分失败：' + error)
      this.logService.writelog({ userid: userid, operationType: 'set', plugin: pluginName, comment: `调用set时出现错误：${error}`, statusCode: 500 })
      return { code: 500, msg: '设置积分失败' }
    }
  }
  // 增加用户积分，用户不存在则创建
  async add(userid: string, transactionId: string, points: number, pluginName?: string): Promise<ApiResponseNoData> {
    //校验transactionId是否是合法的
    if (TransactionIdGenerator.validate(transactionId) === false) {
      this.logService.writelog({ userid: userid, operationType: 'add', plugin: pluginName, comment: `调用get时出现错误：transactionId无效`, statusCode: 400 })
      return { code: 400, msg: 'transactionId无效' }
    }
    if (points < 0) {
      this.logService.writelog({ userid: userid, operationType: 'add', plugin: pluginName, comment: `调用add时出现错误：积分不能为负`, statusCode: 400 })
      log.error('增加积分时出现错误：积分不能为负数')
      return { code: 400, msg: '积分不能为负数' }
    }
    if (points === 0) {
      this.logService.writelog({ userid: userid, operationType: 'add', plugin: pluginName, statusCode: 204 })
      return { code: 204, msg: '增加成功，但意义是什么' }
    }
    try {
      const row = await this.ctx.database.get(database_name, { userid })
      if (row.length === 0) {
        const initial_points = this.cfg.initial_points
        const newValue = initial_points + points
        await this.ctx.database.create(database_name, { userid: userid, points: newValue })
        this.logService.writelog({
          userid: userid,
          operationType: 'add',
          newValue: newValue,
          plugin: pluginName,
          statusCode: 200,
          oldValue: 0,
          transactionId: transactionId
        })
      } else {
        const newValue = row[0].points + points
        await this.ctx.database.set(database_name, { userid: userid }, { points: newValue })
        this.logService.writelog({
          userid: userid,
          operationType: 'add',
          newValue: newValue,
          plugin: pluginName,
          statusCode: 200,
          oldValue: row[0].points,
          transactionId: transactionId
        })
      }
      return { code: 200, msg: '增加成功' }
    } catch (error) {
      log.error('增加积分失败：' + error)
      this.logService.writelog({
        userid: userid,
        operationType: 'add',
        plugin: pluginName,
        comment: `服务端错误：${error.message}`,
        statusCode: 500
      })
      return { code: 500, msg: '增加积分失败' }
    }
  }
  // 减少用户积分，用户不存在则返回错误，用户积分不足则返回错误
  async reduce(userid: string, transactionId: string, points: number, pluginName?: string): Promise<ApiResponseNoData> {
    if (points < 0) {
      this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, comment: `调用reduce时出现错误：积分不能为负数`, statusCode: 400 })
      log.error('减少积分时出现错误：积分不能为负数')
      return { code: 400, msg: '积分不能为负数' }
    }
    if (points === 0) {
      this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, statusCode: 204 })
      return { code: 204, msg: '减少成功，但意义是什么' }
    }
    try {
      //校验transactionId是否是合法的
      if (TransactionIdGenerator.validate(transactionId) === false) {
        this.logService.writelog({ userid: userid, operationType: 'add', plugin: pluginName, comment: `调用get时出现错误：transactionId无效`, statusCode: 400 })
        return { code: 400, msg: 'transactionId无效' }
      }
      const row = await this.ctx.database.get(database_name, { userid })
      if (row.length === 0) {
        this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, comment: `调用reduce时出现错误：用户不存在`, statusCode: 400 })
        return { code: 400, msg: '用户不存在' }
      }
      if (row[0].points < points) {
        this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, comment: `调用reduce被拒绝：用户积分不足`, statusCode: 304 })
        return { code: 304, msg: '用户积分不足' }
      }
      await this.ctx.database.set(database_name, { userid }, {
        points: row[0].points - points
      })
      this.logService.writelog({ userid: userid, operationType: 'reduce', newValue: row[0].points - points, plugin: pluginName, statusCode: 200, oldValue: row[0].points, transactionId: transactionId })
      return { code: 200, msg: '减少成功' }
    } catch (error) {
      log.error('减少积分失败：' + error)
      this.logService.writelog({ userid: userid, operationType: 'reduce', plugin: pluginName, comment: `调用reduce时出现错误：${error}`, statusCode: 500 })
      return { code: 500, msg: '减少积分失败' }
    }
  }
  async updateUserName(userid: string, username: string, pluginName?: string): Promise<ApiResponseNoData> {
    pluginName ??= 'unknown'
    try {
      await this.ctx.database.set(database_name, { userid }, { username })
      this.logService.writelog({ userid: userid, operationType: 'updateUserName', plugin: pluginName, statusCode: 200 })
      return { code: 200, msg: '更新成功' }
    } catch (error) {
      log.error('更新用户名失败：' + error)
      this.logService.writelog({ userid: userid, operationType: 'updateUserName', plugin: pluginName, comment: `调用updateUserName时出现错误：${error}`, statusCode: 500 })
      return { code: 500, msg: '更新用户名失败' }
    }
  }
  async getUserName(userid: string, pluginName?: string): Promise<string> {
    try {
      const row = await this.ctx.database.get(database_name, { userid })
      this.logService.writelog({ userid: userid, operationType: 'get', plugin: pluginName, statusCode: 200 })
      return row.length ? row[0].username : '未知'
    } catch (error) {
      this.logService.writelog({ userid: userid, operationType: 'get', plugin: pluginName, comment: `调用get时出现错误：${error}`, statusCode: 500 })
      log.error('查询积分失败：' + error)
      throw new Error('查询积分失败：' + error)
    }
  }

  // 回写操作，例如扣除的积分后如果需要回写（例如兑换的商品兑换出现异常），可以调用此方法回写积分
  async rollback(userId: string, transactionId: string, pluginName?: string): Promise<ApiResponseNoData> {
    if (TransactionIdGenerator.validate(transactionId) === false) {
      this.logService.writelog({ userid: userId, operationType: 'rollback', plugin: pluginName, comment: `调用rollback时出现错误：transactionId无效`, statusCode: 400 })
      return { code: 400, msg: 'transactionId无效' }
    }
    try {
      const log = await this.ctx.database.get(database_name_log, { userid: userId, transactionId: transactionId })
      if (log.length === 0) {
        this.logService.writelog({ userid: userId, operationType: 'rollback', plugin: pluginName, comment: `调用rollback时出现错误：transactionId无效`, statusCode: 400 })
        return { code: 400, msg: 'transactionId无效' }
      }

      // 检查是否已经回滚过
      if (log[0].isRollback) {
        this.logService.writelog({
          userid: userId,
          operationType: 'rollback',
          plugin: pluginName,
          comment: `调用rollback时出现错误：该事务已被回滚`,
          statusCode: 400
        })
        return { code: 400, msg: '该事务已被回滚' }
      }

      const { userid, oldValue, newValue } = log[0]
      const nowValue = (await this.ctx.database.get(database_name, { userid }))[0].points
      await this.ctx.database.set(database_name, { userid: userId }, { points: nowValue - (newValue-oldValue)  })

      // 更新原始日志，标记为已回滚
      const rollbackId = this.generateTransactionId()
      await this.ctx.database.set(database_name_log, { userid: userId, transactionId: transactionId }, {
        isRollback: true,
        rollbackTransaction: rollbackId
      })

      // 创建回滚操作的日志
      this.logService.writelog({
        userid: userId,
        operationType: 'rollback',
        plugin: pluginName,
        statusCode: 200,
        transactionId: rollbackId,
        rollbackTransaction: transactionId,
        oldValue: log[0].newValue,
        newValue: oldValue,
        comment: `回滚事务 ${transactionId}`
      })

      return { code: 200, msg: '回滚成功' }
    } catch (error) {
      log.error('回滚失败：' + error)
      this.logService.writelog({ userid: '0', operationType: 'rollback', plugin: pluginName, comment: `调用rollback时出现错误：${error}`, statusCode: 500 })
      return { code: 500, msg: '回滚失败' }
    }
  }

  /**
 * 查询事务的回滚状态
 * @param transactionId 事务ID
 * @returns 回滚状态信息
 */
  async getTransactionStatus(transactionId: string): Promise<{isRollback: boolean, rollbackTransaction?: string, rollbackTime?: Date}> {
    if (!TransactionIdGenerator.validate(transactionId)) {
      throw new Error('无效的事务ID')
    }

    const log = await this.ctx.database.get(database_name_log, { transactionId })
    if (log.length === 0) {
      throw new Error('事务不存在')
    }

    return {
      isRollback: !!log[0].isRollback,
      rollbackTransaction: log[0].rollbackTransaction,
      rollbackTime: log[0].isRollback ?
        (await this.ctx.database.get(database_name_log, { transactionId: log[0].rollbackTransaction }))[0]?.time :
        undefined
    }
  }

  async getTopN(num: number): Promise<{
    userid: string
    username: string
    points: number
  }[]> {
    if (!Number.isInteger(num) || num <= 0) {
      this.logService.writelog({ userid: '0', operationType: 'getTopUsers', plugin: name, comment: `调用getTopUsers时出现错误：参数必须为正整数`, statusCode: 400 })
      throw new Error('参数必须为正整数')
    }
    try {
      const topUsers = await this.ctx.database
        .select(database_name)
        .orderBy('points', 'desc')
        .limit(num)
        .execute()
      return topUsers.map((item): {
        userid: string
        username: string
        points: number
      } => ({
        userid: item.userid,
        username: item.username,
        points: item.points
      }))
    } catch (error) {
      log.error(`获取前${num}名用户失败：${error.message}`)
      this.logService.writelog({ userid: '0', operationType: 'getTopUsers', plugin: name, comment: `调用getTopUsers时出现错误：${error}`, statusCode: 500 })
      throw new Error('获取排行榜失败')
    }
  }
}
