# Score View 共和校 Cloudflare配信版（本番未切替）

既存のScore Input / Score Viewはそのまま動作します。配信先の公開・初回同期・実測確認が済むまで現行URLを切り替えません。

## 構成

- `worker.mjs`: 共和校専用の閲覧API。Googleへ取得要求を転送せず、Cloudflare内の同期済み成績を返す。
- `wrangler.jsonc`: SQLite Durable Objectの設定。既存の成績カルテWorkerとは別の新規Worker。
- `AppsScript-with-sync.gs`: 既存コード全文に同期機能を追加した版。保存、削除、手入力の連携を維持。
- `viewer.html`: 配信先URLと閲覧キーを入力して確認する移行確認画面。同期日時を表示。
- `test.mjs`: API単体テスト。実Cloudflare環境の試験は未実施。

## 配信先の準備

1. このディレクトリで公式Wranglerを使用し、Cloudflareへログインする。
2. `SYNC_KEY` と `VIEW_KEY` に異なる十分長いランダム文字列をSecretsとして設定する（各32文字以上を推奨）。値をGitHub、画面HTML、チャットには書かない。
3. `wrangler deploy` で新規 `score-view-kyowa` Workerを公開する。
4. 実際に発行されたWorker URLを確認する。名前からURLを推測しない。

## Apps Scriptの設定

1. 既存コード.gsをバックアップし、`AppsScript-with-sync.gs`の全文に置き換える。
2. プロジェクトの設定 → スクリプトプロパティで以下を設定する。
   - `SCORE_MIRROR_URL`: 発行されたWorker URL（末尾に /sync を付けない）
   - `SCORE_MIRROR_SYNC_KEY`: Workerの `SYNC_KEY` と同じ値
3. `installScoreMirrorTrigger` を一度実行し、必要なGoogleの権限を確認する。5分ごとの同期と初回同期を行う。
4. 既存ウェブアプリのデプロイを新バージョンへ更新する。既存URLを維持する。

保存・削除の成功後、同期を試みます。同期が失敗しても保存済み成績を失敗扱いにはしません。結果に `mirrorSync` を付け、スクリプトプロパティ `SCORE_MIRROR_LAST_ERROR` と実行ログに失敗を記録します。5分ごとの同期でも再試行します。手入力とマスター等の直接編集にも同期します。

## 確認と本番切替

1. `viewer.html` を開き、Worker URLと `VIEW_KEY` を入力する。これは閲覧だけのキーで、同期権限はありません。
2. 年度・テスト・学年ごとの成績、未入力、0点、削除後の反映、最終同期日時を確認する。
3. Google側の保存が成功しCloudflareへの同期だけ失敗した場合、最終同期日時が古い状態として表示される。同期済みデータはリアルタイム原本とは異なる。
4. 実環境で通信時間とエラー率を比較する。速さは実測するまで保証しない。
5. 確認後、社員向け設定導線を含めた画面を既存 `score-viewer/index.html` へ反映する。既存アプリURLとQRを維持できる。

## 制限

- 閲覧キーは社員間で共有する簡易認証。個人ごとの権限管理や固定IP制限は未実装。
- 現在の在籍マスターを使うため、過去年の所属や退塾生を再現する機能はありません。
- 一括同期は最大約4MB。規模が増えた場合は教室・年度単位の分割が必要。
- Google側の同期処理の権限承認とCloudflareのアカウントログインが必要。
- 読み込みでGoogleにアクセスしないので、同期以降の閲覧でGoogleの転送待ちを避けられる。ただしCloudflare内の実速度は公開後に検証する。

参考: https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/
