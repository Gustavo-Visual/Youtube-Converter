import { create as createYoutubeDl } from 'youtube-dl-exec';
import path from 'path';

const YT_DLP_PATH = path.resolve(process.cwd(), 'temp', 'yt-dlp');
console.log('Testing custom yt-dlp binary at:', YT_DLP_PATH);

const youtubedl = createYoutubeDl(YT_DLP_PATH);

async function test() {
  console.log('Starting fetch...');
  try {
    const result = await youtubedl('https://www.youtube.com/watch?v=Pxfz7-87kdI', {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
    });
    console.log('Success! Title:', (result as any).title);
  } catch (err) {
    console.error('Error during fetch:', err);
  }
}

test();
