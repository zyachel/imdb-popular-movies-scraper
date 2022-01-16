///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                          IMPORTING MODULES
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const axios = require('axios').default;
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                           GETTING ARGS FROM THE COMMAND AND SETTING VARS ACCORDINGLY
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// prettier-ignore
const acceptedGenres = ["action","adventure","animation","biography","comedy","crime","documentary","drama","family","fantasy","film-noir","history","horror","music","musical","mystery","romance","sci-fi","short","sport","thriller","war","western","game-show","news","reality-tv","talk-show"];
const args = process.argv;

const [toScrapeImages, toScrapeData, toSaveLowResImg, imageQuality] = [
  args.includes('images'),
  args.includes('data'),
  args.some(arg => arg.startsWith('low-res')),
  +args.find(arg => arg.startsWith('low-res'))?.split('=')[1] || 450,
];
const genresToScrape = args.includes('all')
  ? acceptedGenres
  : args.filter(argument => acceptedGenres.includes(argument));

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                      RETURNING IN CASE OF INVALID ARGUMENTS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
if (args.includes('help'))
  return console.log(
    //prettier-ignore
    `scrape <genre(s)> <arg(s)>\n\nvalid genre(s): 'all' for all genres. specific genres: ${acceptedGenres.join(', ')}\n\nvalid arg(s): 'data' for saving data(in JSON format) to the disk. 'images' for scraping images. 'low-res' for saving images in low resolution. default low resolution is 450px. you can specify another resolution like this: 'low-res=600'\n\nif arg 'low-res' in not specified, images will be saved in original size.\n\nexample usage: npm run scrape sci-fi action data images low-res=700`
  );

if (!genresToScrape.length)
  //prettier-ignore
  return console.log(
    `please provide at least one genre to scrape. For scraping all genres, use 'all'. Allowed genres are: 
    ${acceptedGenres.join(', ')}`
  );

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                    MAIN FUCTIONS THAT'LL DO THE JOB
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const scrapeAndCleanData = async function (genres) {
  // never ever use forEach with async/await
  // for explanation: https://stackoverflow.com/questions/37576685/using-async-await-with-a-foreach-loop

  let movies = [];
  try {
    // PUTTING MOVIES IN THE MOVIES ARRAY
    for (const genre of genres) {
      // getting html from imdb
      const res = await axios(
        `https://www.imdb.com/search/title/?explore=title_type,genres&genres=${genre}`
      );

      // magic of cheerio starts here(unless imdb changes the interface)
      const $ = cheerio.load(res.data);
      $('.lister-item').each((i, el) => {
        const name = $(el).find('.lister-item-header a').text();

        const link = $(el)
          .find('.lister-item-header a')
          .attr('href')
          .match(/tt\d+/gm)[0];

        const rating = $(el).find('.ratings-imdb-rating').data('value') || 0;

        const numVotes =
          $(el)
            .find('.sort-num_votes-visible > span[data-value]')
            .data('value') || 0;

        const year = $(el)
          .find('.lister-item-year')
          .text()
          .replace(/[a-zA-Z]|\(|\)|\s/g, '');

        const description = $(el)
          .find('p')
          .nextAll('p')
          .first()
          .text()
          .replace(/\s\s+.*/gms, '')
          .trim();

        let misc = $(el)
          .find('p')
          .nextAll('p')
          .slice(1, 2)
          .text()
          .trim()
          .replace(/(\s\s+|\n)/gm, '')
          .split('|')
          .map(el => el.trim());

        let actors, directors;

        if (!misc[1]) {
          directors = [];
          actors = misc[0].split(':')[1]?.split(',') || []; // had to do this for a documentary that has no info
        } else {
          directors = misc[0].split(':')[1].split(',');
          actors = misc[1].split(':')[1].split(',');
        }

        const image = `${link}.jpeg`; // to store in DB

        // the awesome part: getting img url, modifying it and downloading it
        // some guy on SO told a way to do it. I just wrote a regex to get it.
        const imageLinkImdb =
          $(el)
            .find('.lister-item-image > a ')
            .html()
            .match(/https:\/\/m\.media-amazon\.com\/images\/M\/[^.]*/gm)?.[0] +
          '.jpeg';

        // prettier-ignore
        const movie = {name,genre,image,imageLinkImdb,link,year,rating,numVotes,description,actors,directors};

        // in case everything's good, pushing movie to movies array
        movies.push(movie);
      });
    }

    // CLEANING THE MOVIES ARRAY(removing duplicate entries and merging their genres into one entry)
    for (let i = 0; i < movies.length; i++) {
      const curMovie = movies[i];
      if (curMovie === undefined) continue;

      const movieGenres = [];
      movies.forEach((movie, j) => {
        if (movie.link === curMovie.link && j !== i) {
          movieGenres.push(movie.genre);
          delete movies[j];
        }
      });
      curMovie.genre = [...new Set([curMovie.genre, ...movieGenres])];
    }
    movies = movies.filter(Boolean);

    return movies;
  } catch (err) {
    throw err;
  }
};

const scrapeImages = async function (data, imageFolderPath) {
  // if img folder doesn't exist, making it
  if (!fs.existsSync(imageFolderPath)) fs.mkdirSync(imageFolderPath);

  console.log('downloading images...');

  // taking two props out of big data array
  const movies = data.map(movie => ({
    imageName: movie.image,
    imageLinkImdb: toSaveLowResImg
      ? `${movie.imageLinkImdb.split('.jpeg')[0]}.UX${imageQuality}.jpeg`
      : movie.imageLinkImdb,
  }));

  let errCount = 0; // counting images that couldn't be downloaded

  // getting stream by sending get request to the movie image link, reducing its quality using sharp and then saving it to the disk through a writable stream
  for (const movie of movies) {
    try {
      const pathToImage = path.join(imageFolderPath, movie.imageName);

      if (movie.imageLinkImdb.includes('undefined')) continue; // some movies don't have cover image on imdb
      if (fs.existsSync(pathToImage)) continue; // not downloading image if it already exists!

      const res = await axios({
        url: movie.imageLinkImdb,
        method: 'GET',
        responseType: 'stream',
      });

      // transforming the buffer in between and then writing the stream to the specified path
      const transformer = sharp().jpeg({ quality: 80 });
      await res.data.pipe(transformer).pipe(fs.createWriteStream(pathToImage));
    } catch (err) {
      console.log(
        `${movie.image} couldn't be downloaded. Reason: ${err.message}`
      );
      errCount++;
      continue; // i don't want whole script to stop on one small error;
    }
  }

  console.log(`${errCount} images couldn't be downloaded`);
};

const scrape = async function (data = false, images = false) {
  try {
    // main folder:
    const folder = path.join(__dirname, '../dist');
    if (!fs.existsSync(folder)) fs.mkdirSync(folder);
    //   1). GETTING MOVIES DATA FOR THE PROVIDED GENRES
    let movies = await scrapeAndCleanData(genresToScrape);

    // 2). MAKING A JSON AND SAVING IT TO THE DISK FROM THE MOVIES ARRAY
    if (data) {
      fs.writeFileSync(
        path.join(folder, 'movies.json'),
        JSON.stringify(movies)
      );
      console.log('data saved to disk');
    }
    // 3.) SAVING IMAGES TO THE DISK
    if (images) {
      await scrapeImages(movies, path.join(folder, '/img'));
      console.log('images saved to the disk');
    }

    // catching any errors
  } catch (err) {
    console.log(err);
  }
};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                  SCRAPING
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

if (!toScrapeData && !toScrapeImages)
  return console.log(
    `please add at least one argument to scrape for. Accepted arguments are 'data' and 'images'`
  );
else if (!toScrapeData && toScrapeImages) {
  console.log(
    `scraping images(in ${toSaveLowResImg ? imageQuality : 'full'} res) for ${
      genresToScrape.length
    } genres...`
  );
  scrape(false, true);
} else if (toScrapeData && !toScrapeImages) {
  console.log(`scraping data for ${genresToScrape.length} genres...`);
  scrape(true, false);
} else if (toScrapeImages && toScrapeData) {
  console.log(
    `scraping images(in ${
      toSaveLowResImg ? imageQuality : 'full'
    } res) and data for ${genresToScrape.length} genres...`
  );
  scrape(true, true);
}
