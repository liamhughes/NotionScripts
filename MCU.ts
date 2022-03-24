import dotenv from "dotenv";
dotenv.config();

import { Client, LogLevel } from "@notionhq/client";
import { DatabasesQueryParameters, PagesUpdateParameters } from "@notionhq/client/build/src/api-endpoints";
import chalk from "chalk";
import open from "open";
import prompt from "prompt";
import replace from 'lodash.replace';

const databaseID = "b054cc29c9a24f95b7588446804e1220"; // https://www.notion.so/b054cc29c9a24f95b7588446804e1220?v=b850c006ae8d48a6866a1ca4d17cea68
const rankPropertyName = "Rank";
const rankedPropertyName = "Ranked";

class Movie {
    isRanked: boolean;
    name: string;
    newRank: number;
    originalRank: number;
    pageID: string;
  
    constructor(pageID: string, name: string, rank: number, isRanked: boolean) {
        this.pageID = pageID;
        this.name = name;
        this.originalRank = rank;
        this.newRank = rank;
        this.isRanked = isRanked;
    }
  
    public static fromPage(page : any) {
        let rank = page.properties.Rank?.number ?? -0.5;

        return new Movie(
            page.id,
            page.properties.Name.title[0].plain_text,
            rank,
            page.properties[rankedPropertyName].checkbox
        );
    }

    public toString(){
        var result = this.name;

        return result;
    }
}

const main = async () => {

    const client = new Client({
        "auth": process.env.NOTION_TOKEN,
        "logLevel": LogLevel.DEBUG,
    });

    const movies = await getMovies(client);

    while(true){

        sortMoviesByNewRank(movies);

        const firstNotRankedMovie = movies.find(t => !t.isRanked) as Movie;

        if (firstNotRankedMovie === undefined){
            console.log("All movies are ranked.");
            break;
        }

        const firstNotRankedMovieRank = firstNotRankedMovie?.newRank;

        const moviesToRank = firstNotRankedMovieRank === undefined || firstNotRankedMovieRank <= 0
            ? [firstNotRankedMovie]
            : movies.filter(t => t.newRank === firstNotRankedMovieRank);

        const otherMovies = movies.filter(t => 
            t.newRank !== undefined && t.newRank > 0 && t.newRank !== firstNotRankedMovieRank
        );

        otherMovies.unshift(new Movie("", "Placeholder first movie", 0, false));
        otherMovies.push(new Movie("", "Placeholder last movie", otherMovies.slice(-1)[0].newRank + 1, false));

        const orderedUniqueRanksOfOtherMovies = getOrderedUniqueRanks(otherMovies);

        let lowestRankIndex = 0;
        let highestRankIndex = orderedUniqueRanksOfOtherMovies.length;

        while (highestRankIndex - lowestRankIndex > 1) {

            console.log(chalk.grey("==============================================="));

            const thisRoundRankIndex = Math.floor((lowestRankIndex + highestRankIndex) / 2);

            const thisRoundOtherMovies = movies.filter(t => t.newRank === orderedUniqueRanksOfOtherMovies[thisRoundRankIndex]);

            moviesToRank.forEach(t => console.log(chalk.blue(t.toString())));

            console.log(chalk.yellow("===================== vs. ====================="));

            thisRoundOtherMovies.forEach(t => console.log(chalk.green(t.toString())));

            const result = (await prompt.get([promptSchema])).result;

            if (result === "h") {
                highestRankIndex = thisRoundRankIndex;
            }
            else if (result === "l") {
                lowestRankIndex = thisRoundRankIndex;
            }
            else if (result === "s") {
                highestRankIndex = thisRoundRankIndex;
                lowestRankIndex = thisRoundRankIndex;
            }
            else {
                process.exit(0);
            }
        }

        const newRank = (orderedUniqueRanksOfOtherMovies[highestRankIndex] + orderedUniqueRanksOfOtherMovies[lowestRankIndex]) / 2;

        moviesToRank.forEach(t => t.newRank = newRank);
    
        for (const rank of moviesToRank) {
            await updateMovieAndOpenUrl(client, rank);
        }

        moviesToRank.forEach(t => t.isRanked = true);
    }
};

const getOrderedUniqueRanks = (movies : Movie[]) => {

    const result = [...new Set(movies.map(t => t.newRank))];

    result.sort((a,b) => a - b);

    return result;
};

const getMovies = async (client : Client) : Promise<Movie[]> => {
    
    let hasMore = true;
    let nextCursor : string | null = null;
    const moviePages = [];

    while (hasMore){
        const request : DatabasesQueryParameters = {
            "database_id": databaseID,
            "sorts": [
                {
                    "property": rankPropertyName,
                    "direction": "ascending",
                }
            ],
        };

        if (nextCursor !== null)
            request.start_cursor = nextCursor;

        const response = await client.databases.query(request);

        moviePages.push(...response.results);
        hasMore = response.has_more;
        nextCursor = response.next_cursor;
    }

    const pages = moviePages.map(Movie.fromPage);

    return pages;
};

const promptSchema = {
    properties: {
      result: {
        description: '(h)igher, (l)ower, (s)ame or (q)uit',
        message: '(h)igher, (l)ower, (s)ame or (q)uit',
        pattern: /^[hlsq]$/,
        required: true
      }
    }
};

const sortMoviesByNewRank = (movies: Movie[]) => {
    movies.sort((t1,t2) => t1.newRank - t2.newRank);
};

const updateMovieAndOpenUrl = async (client : Client, movie : Movie) => {

    if (movie.newRank === movie.originalRank){
        console.log(`Movie '${movie.name}' already has a rank of ${movie.originalRank}.`);
    }
    else {
        console.log(`Update movie '${movie.name}' from ${movie.originalRank} to ${movie.newRank}.`);
    }

    const request = {
        "page_id": movie.pageID,
        "properties": {
            [rankPropertyName]: {
                "number": movie.newRank
            },
            [rankedPropertyName]: {
                "checkbox": true
            }
        },
    };

    await client.pages.update(request as unknown as PagesUpdateParameters);
        
    open(`https://www.notion.so/${replace(movie.pageID, new RegExp("-","g"), "")}`);
};

main();