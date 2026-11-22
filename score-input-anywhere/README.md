# Score Input｜校舎共通版

既存の共和校・大府柊山校版とは別のアプリです。校舎名を自由入力し、同じログインで複数の校舎を作成できます。生徒、テスト、学校平均、成績、履歴CSVを扱います。成績はCloudflare D1へ保存し、校舎とログイン利用者でアクセスを分離します。既存アプリのデータや接続先は引き継ぎません。

## Cloudflareへの公開

Node.js 22.13以上とpnpmを用意し、このディレクトリで作業してください。GitHub PagesだけではD1を使う保存APIを動かせません。Cloudflare WorkersとD1、Cloudflare Accessを使用します。

1. Cloudflareアカウントにログインし、`pnpm install --frozen-lockfile` を実行します。
2. `pnpm exec wrangler login` の後、`pnpm exec wrangler d1 create score-input-anywhere` を実行し、表示された `database_id` を `wrangler.jsonc` に設定します。
3. Cloudflare Zero Trust の Access でこのWorker用のアプリと許可ポリシーを作成します。Worker全体を保護し、利用を許すメールアドレスだけを指定してください。Workersの公開URLが決まったら、そのURLが保護対象に含まれることを確認します。
4. Accessのチームドメイン（例：`https://example.cloudflareaccess.com`）とアプリの Audience (AUD) Tag を `wrangler.jsonc` の `TEAM_DOMAIN`、`POLICY_AUD` に設定します。プレースホルダーのままでは公開しないでください。
5. `pnpm exec wrangler d1 execute score-input-anywhere --remote --file drizzle/0000_rapid_serpent_society.sql` で初期テーブルを作成します。
6. `pnpm check`、`pnpm build`、`pnpm exec wrangler deploy --config dist/server/wrangler.json` を実行します。表示されたURLでAccessログイン後、校舎を登録します。

GitHubからの自動公開を選ぶ場合はCloudflare WorkersのGitHub連携で、このディレクトリをRoot directoryに指定します。初期DB移行とAccess設定を終えてからデプロイしてください。公開リポジトリに実データ、ログイン情報、APIトークンを入れないでください。`wrangler.jsonc` のD1 IDとAUDは環境識別子であり、認証の秘密鍵ではありません。

## 利用

1. 初回に校舎名を自由入力して登録し、別の校舎も随時追加できます。「設定」から改名できます。
2. 生徒番号、氏名、学年、学校、登録年度を登録します。学年は小1〜高3とその他です。
3. 年度とテスト名、必要なら学校平均を登録します。
4. 成績入力画面で点数、偏差値、順位、回収状況、メモを保存します。
5. 成績一覧で記録を確認し、履歴CSVを出力できます。

同じ生徒とテストの成績は更新され、古い画面からの上書きは拒否します。退塾生の過去記録は残ります。校舎共有や講師招待は未実装です。

## 開発時の認証

保存APIはCloudflare Accessの `Cf-Access-Jwt-Assertion` を公開鍵で検証し、issuer、audience、有効期限、署名を確認します。Access設定のないローカル画面では保存APIを利用できません。`node scripts/check-score.mjs` はメモリ上のD1互換DBで校舎分離と保存操作を検証します。
