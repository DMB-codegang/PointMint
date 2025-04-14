import { Context } from 'koishi'
import { PointService } from '..'
import { Config } from '../config'
import { name, database_name } from '..'

export function registerCommands(ctx: Context, service: PointService, cfg: Config) {
  if (cfg.check_points_command_set) {
    ctx.command('查询积分').action(async ({ session }) => {
      const pointsResult = await service.get(session.userId, name)
      if (pointsResult == -1) {
        session.send('您还没有积分哦，快去获得一些吧')
        return
      }
      const responseText = cfg.check_points_command.replace(/\{points\}/gi, pointsResult.toString())
      session.send(responseText)

      if (cfg.auto_log_username && cfg.auto_log_username_type === 'only_command') {
        const username = session.username
        const database_username = await ctx.database.get(database_name, { userid: session.userId })
        if (database_username.length === 0 || database_username[0].username !== username) {
          service.updateUserName(session.userId, session.username)
        }
      }
    })
  }
}