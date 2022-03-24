import dotenv from "dotenv";
dotenv.config();

import { Client, LogLevel } from "@notionhq/client";
import { DatabasesQueryParameters, PagesUpdateParameters } from "@notionhq/client/build/src/api-endpoints";

const databaseID = "b054cc29c9a24f95b7588446804e1220";
const rankPropertyName = "Rank";

class Movie {
    name: string;
    pageID: string;
    rank: number;
    newRank: number;
  
    constructor(pageID: string, name: string, rank: number) {
        this.pageID = pageID;
        this.name = name;
        this.rank = rank;
        this.newRank = rank;
    }
  
    public static fromPage(page : any) {
        return new Movie(
            page.id,
            page.properties.Name.title[0].plain_text,
            page.properties.Rank.number
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

    const orderedUniqueRanks = getOrderedUniqueRanks(movies);

    movies.forEach(t => t.newRank = orderedUniqueRanks.indexOf(t.rank) + 1);

    for (const movie of movies) {
        await updateRank(client, movie);
    }
};

const getOrderedUniqueRanks = (movies : Movie[]) => {
    const result = [...new Set(movies.map(t => t.rank))];

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

const updateRank = async (client : Client, movie : Movie) => {
    if (movie.rank === movie.newRank){
        console.log(`Movie '${movie.toString()}' already has a rank of ${movie.rank}.`);
        return;
    }

    console.log(`Update movie '${movie.toString()}' from ${movie.rank} to ${movie.newRank}.`);

    const request = {
        "page_id": movie.pageID,
        "properties": {
            [rankPropertyName]: {
                "number": movie.newRank
            }
        },
    };

    await client.pages.update(request as unknown as PagesUpdateParameters);
};

main();