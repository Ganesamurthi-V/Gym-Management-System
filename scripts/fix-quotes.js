const fs = require('fs');
const files = [
  'c:/Gym Management system/gymflow/app/api/account/delete-data/route.ts',
  'c:/Gym Management system/gymflow/app/api/account/delete-gym/route.ts',
  'c:/Gym Management system/gymflow/app/api/import/route.ts'
];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/\\\'/g, "'");
  fs.writeFileSync(f, content);
});
