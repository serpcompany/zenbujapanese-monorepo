import { runService } from '../http'

runService(async () => {
  throw new Error('the database refused the migration')
})
