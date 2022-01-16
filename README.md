# IMDb popular movies scraper
A basic script to scrape data of popular movies across genres from IMDb.

## Requirements
* nodejs
* cheerio(for scraping)
* axios(for sending requests)
* sharp(for lowering the quality a bit)

## Installation
* clone the repo
* run ```npm install```

## Usage
scrape <genre(s)> <arg(s)>
* valid genre(s): 
  * ```all``` for all genres.
  * allowed genres: ```action```, ```adventure```, ```animation```, ```biography```, ```comedy```, ```crime```, ```documentary```, ```drama```, ```family```, ```fantasy```, ```film-noir```, ```history```, ```horror```, ```music```, ```musical```, ```mystery```, ```romance```, ```sci-fi```, ```short```, ```sport```, ```thriller```, ```war```, ```western```, ```game-show```, ```news```, ```reality-tv```, ```talk-show```
  
* valid arg(s): 
  * ```data``` for saving data(in JSON format) to the disk.
  * ```images``` for scraping images.
  * ```low-res``` for saving images in low resolution. defaults to 450px. you can specify another resolution like this: ```low-res=600```. if this argument in not specified, images will be saved in their original size.
      
      
 ### Example usage:
 ```npm run scrape sci-fi action data images low-res=700```
