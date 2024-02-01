import dotenv from "dotenv";
dotenv.config();

import { Client, LogLevel } from "@notionhq/client";
import { DatabasesQueryParameters, PagesUpdateParameters } from "@notionhq/client/build/src/api-endpoints";
import { SinglePropertyFilter } from "@notionhq/client/build/src/api-types";
import objectsToCsv from "objects-to-csv";

const databaseID = "d627deed1bd3496e8878162771952649"
const startPropertyName = "Start";

class Entry {
    pageID: string;
    name: string;
    start: Date;
    categoryA: string;
    categoryB: string;
    categoryAB: string;
    duration: number;

    constructor(pageID: string, name: string, start: Date, categoryA: string, categoryB: string, categoryAB: string, duration: number) {
        this.pageID = pageID;
        this.name = name;
        this.start = start;
        this.categoryA = categoryA;
        this.categoryB = categoryB;
        this.categoryAB = categoryAB;
        this.duration = duration;
    }

    public static fromPage(page: any) {
        let duration = page.properties.Duration?.formula.number ?? 0;
        let catA = page.properties['Category A']?.select?.name ?? 'Other';
        let catB = page.properties['Category B']?.select?.name ?? 'Other';

        return new Entry(
            page.id,
            page.properties.Name.title[0]?.plain_text,
            page.properties.Start.date.start,
            catA,
            catB,
            catA + ' / ' + catB,
            duration
        );
    }

    public toString() {
        var result = this.name;
        return result;
    }
}

const main = async () => {

    const client = new Client({
        "auth": process.env.NOTION_TOKEN,
        "logLevel": LogLevel.DEBUG,
    });

    const entries = await getEntries(client);

    const csv = new objectsToCsv(entries);

    await csv.toDisk('./TimeLog.csv');
};

const getEntries = async (client: Client): Promise<Entry[]> => {

    let hasMore = true;
    let nextCursor: string | null = null;
    const taskPages = [];

    while (hasMore) {
        const request: DatabasesQueryParameters = {
            "database_id": databaseID,
            "sorts": [
                {
                    "property": startPropertyName,
                    "direction": "ascending",
                }
            ],
        };

        // const listFilter: SinglePropertyFilter ={
        //       "property": startPropertyName,
        //       "date": {
        //         "after": "2023-12-01"
        //       }
        //   };       

        const listFilter: SinglePropertyFilter = {
            "property": startPropertyName,
            "date": {
                "past_week": {}
            }
        };

        request.filter = listFilter;

        if (nextCursor !== null)
            request.start_cursor = nextCursor;

        const response = await client.databases.query(request);

        taskPages.push(...response.results);
        hasMore = response.has_more;
        nextCursor = response.next_cursor;
    }

    const pages = taskPages.map(Entry.fromPage);

    console.table(pages);

    return pages;
};

main();