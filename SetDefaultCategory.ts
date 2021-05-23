import dotenv from "dotenv";
dotenv.config();

import { Client, LogLevel } from "@notionhq/client";
import { DatabasesQueryParameters, PagesUpdateParameters } from "@notionhq/client/build/src/api-endpoints";

const categoryPropertyName = "Category";
const databaseID = "dae968ec2e6a4e15aec83a25c790b1a3";
const defaultCategory = "Personal";

class Task {
    name: string;
    pageID: string;
  
    constructor(pageID: string, name: string) {
        this.pageID = pageID;
        this.name = name;
    }
  
    public static fromPage(page : any) {
        return new Task(
            page.id,
            page.properties.Name.title[0].plain_text,
        );
    }
}

const main = async () => {
    const client = new Client({
        "auth": process.env.NOTION_TOKEN,
        "logLevel": LogLevel.DEBUG,
    });

    const tasks = await getTasks(client);

    for (const task of tasks) {
        await updatePriority(client, task);
    }
};

const getTasks = async (client : Client) : Promise<Task[]> => {
    
    let hasMore = true;
    let nextCursor : string | null = null;
    const taskPages = [];

    while (hasMore){
        const request : DatabasesQueryParameters = {
            "database_id": databaseID,
            "sorts": [
                {
                    "property": "Priority",
                    "direction": "ascending",
                },
                {
                    "property": "Start Date",
                    "direction": "ascending",
                }
            ],
        };

        const categoryFilter = {
            "or": [
                {
                    "property": categoryPropertyName,
                    "select": {
                        "is_empty": true
                    }
                }
            ]
        };

        request.filter = {
            "and": [
                categoryFilter
            ]
        };

        if (nextCursor !== null)
            request.start_cursor = nextCursor;

        const response = await client.databases.query(request);

        taskPages.push(...response.results);
        hasMore = response.has_more;
        nextCursor = response.next_cursor;
    }

    const pages = taskPages.map(Task.fromPage);

    return pages;
};

const updatePriority = async (client : Client, task : Task) => {

    console.log(`Updating task '${task.name}' to category '${defaultCategory}'.`);

    const request = {
        "page_id": task.pageID,
        "properties": {
            [categoryPropertyName]: {
                "select": {
                    "name": defaultCategory
                }
            }
        }
    };

    const response = await client.pages.update(request as unknown as PagesUpdateParameters);

    console.log(response);
};

main();