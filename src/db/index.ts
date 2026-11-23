import { db, transaction } from './connection';
import { migrate } from './schema';
import { seedNewDatabase, upgradeSeeds } from './seed';

export { DB_PATH, db, transaction } from './connection';

/**
 * 스키마를 최신으로 올리고, 새로 만든 DB면 기본값을 넣습니다. 이 모듈을 불러올 때 한 번 실행됩니다.
 * 스키마와 기본값을 한 트랜잭션으로 묶어, 기본값 넣기가 실패하면 빈 DB로 되돌립니다(다음 시작 때 다시 시도).
 */
export function prepareDatabase() {
  transaction(() => {
    const { created, from } = migrate(db);
    if (created) seedNewDatabase();
    else upgradeSeeds(from);
  });
}

prepareDatabase();
