import Outcome from '../models/Outcome.js';
import Resident from '../models/Resident.js';
import ChatAccount from '../models/ChatAccount.js';
import Income from '../models/Income.js';

// Every place an uploaded file can be referenced from. A file is only deleted
// once no record of any kind points to it.
export async function fileInUse(file) {
  const [outcome, resident, account, income] = await Promise.all([
    Outcome.exists({ 'images.file': file }),
    Income.exists({ 'images.file': file }),
    Resident.exists({ 'photo.file': file }),
    ChatAccount.exists({ 'screenshot.file': file }),
  ]);
  return Boolean(outcome || resident || account || income);
}

export const imageUrl = (i) => (i?.file ? { file: i.file, url: `/api/files/${i.file}`, name: i.name, type: i.type, size: i.size } : null);
