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
    category1: string;
    category12: string;
    category123: string;
    duration: number;

    constructor(pageID: string, name: string, start: Date, category1: string, category12: string, category123: string, duration: number) {
        this.pageID = pageID;
        this.name = name;
        this.start = start;
        this.category1 = category1;
        this.category12 = category12;
        this.category123 = category123;
        this.duration = duration;
    }

    public static fromPage(page: any) {
        let duration = page.properties.Duration?.formula.number ?? 0;
        let cat1 = page.properties['Category 1']?.select?.name ?? 'Other';
        let cat2 = page.properties['Category 2']?.select?.name ?? 'Other';
        let cat3 = page.properties['Category 3']?.select?.name ?? 'Other';

        return new Entry(
            page.id,
            page.properties.Name.title[0]?.plain_text,
            page.properties.Start.date.start,
            cat1,
            cat1 + ' - ' + cat2,
            cat1 + ' - ' + cat2 + ' - ' + cat3,
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