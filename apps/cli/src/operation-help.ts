export const OPERATION_EXAMPLES = [
  '  {"op":"add-variable","id":"sales","label":"売上"}          position を省くと自動で置く',
  '  {"op":"update-variable","id":"sales","label":"月の売上","position":{"x":0,"y":0}}',
  '  {"op":"remove-variable","id":"sales"}                       つながる関連とループも消す',
  '  {"op":"add-link","from":"sales","to":"staff","polarity":"+","delay":true}',
  '  {"op":"update-link","from":"sales","to":"staff","polarity":"-"}   id で指してもよい',
  '  {"op":"remove-link","from":"sales","to":"staff"}',
  '  {"op":"add-loop","through":["sales","staff"],"name":"成長"}   辿る順に変数を並べる',
  '  {"op":"update-loop","id":"成長","name":"成長エンジン"}',
  '  {"op":"remove-loop","id":"成長"}',
  '  {"op":"set-title","title":"組織の成長"}',
];
