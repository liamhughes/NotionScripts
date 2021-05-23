import dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import { Client, LogLevel } from "@notionhq/client";
import { DatabasesQueryParameters } from "@notionhq/client/build/src/api-endpoints";

const databaseID = "dae968ec2e6a4e15aec83a25c790b1a3";

const main = async () => {
    const notion = new Client({
        auth: process.env.NOTION_TOKEN,
        logLevel: LogLevel.DEBUG,
    });

    const tasksDatabase = await notion.databases.retrieve({"database_id": databaseID});

    console.log(tasksDatabase);

    fs.writeFileSync("Database.json", JSON.stringify(tasksDatabase, null, 2));

    let hasMore = true;
    let nextCursor : string | null = null;
    const tasks = [];

    while (hasMore){
        const request : DatabasesQueryParameters = {
            database_id: databaseID,
            sorts: [
                {
                    property: "Category",
                    direction: "ascending",
                },
                {
                    property: "Priority",
                    direction: "ascending",
                },
                {
                    property: "Start Date",
                    direction: "ascending",
                }
            ],
        };

        if (nextCursor !== null)
            request.start_cursor = nextCursor;

        const response = await notion.databases.query(request);

        tasks.push(...response.results);
        hasMore = response.has_more;
        nextCursor = response.next_cursor;
    }

    console.log(tasks);

    fs.writeFileSync("Tasks.json", JSON.stringify(tasks, null, 2));
};

main();