import dotenv from "dotenv";
dotenv.config();

import { Client, LogLevel } from "@notionhq/client";
import { DatabasesQueryParameters, PagesUpdateParameters } from "@notionhq/client/build/src/api-endpoints";

let category = "Personal";

const categoryPropertyName = "Category";
const databaseID = "dae968ec2e6a4e15aec83a25c790b1a3";
const defaultCategory = "Personal";
const priorityPropertyName = "Priority";

class Task {
    emoji: string | null;
    name: string;
    pageID: string;
    priority: number;
    newPriority: number;
  
    constructor(pageID: string, name: string, emoji: string | null, priority: number) {
        this.pageID = pageID;
        this.name = name;
        this.emoji = emoji;
        this.priority = priority;
        this.newPriority = priority;
    }
  
    public static fromPage(page : any) {
        return new Task(
            page.id,
            page.properties.Name.title[0].plain_text,
            page.icon?.emoji,
            page.properties.Priority.number
        );
    }

    public toString(){
        var result = this.name;

        if (this.emoji !== null && this.emoji !== undefined) {
            result = this.emoji + " " + result;
        }

        return result;
    }
}

const main = async () => {

    category = process.argv.splice(2)[0];

    const client = new Client({
        "auth": process.env.NOTION_TOKEN,
        "logLevel": LogLevel.DEBUG,
    });

    const tasks = await getTasks(client);

    const orderedUniquePriorities = getOrderedUniquePriorities(tasks);

    tasks.forEach(t => t.newPriority = orderedUniquePriorities.indexOf(t.priority) + 1);

    for (const task of tasks) {
        await updatePriority(client, task);
    }
};

const getOrderedUniquePriorities = (tasks : Task[]) => {
    const result = [...new Set(tasks.map(t => t.priority))];

    result.sort((a,b) => a - b);

    return result;
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
                    "property": priorityPropertyName,
                    "direction": "ascending",
                },
                {
                    "property": "Start Date",
                    "direction": "ascending",
                }
            ],
        };

        const categoryFilter = category === defaultCategory
            ? {
                "or": [
                    {
                        "property": categoryPropertyName,
                        "select": {
                            "equals": defaultCategory
                        }
                        
                    },
                    {
                        "property": categoryPropertyName,
                        "select": {
                            "is_empty": true
                        }
                    }
                ]
            }
            : {
                "or": [
                    {
                        "property": categoryPropertyName,
                        "select": {
                            "equals": category
                        }
                        
                    }
                ]
            };

        request.filter = {
            "and": [
                categoryFilter,
                {
                    "property": priorityPropertyName,
                    "number": {
                        "is_not_empty": true
                    }
                },
                {
                    "property": priorityPropertyName,
                    "number": {
                        "greater_than": 0
                    }
                }
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
    if (task.priority === task.newPriority){
        console.log(`Task '${task.toString()}' already has a priority of ${task.priority}.`);
        return;
    }

    console.log(`Update task '${task.toString()}' from ${task.priority} to ${task.newPriority}.`);

    const request = {
        "page_id": task.pageID,
        "properties": {
            [priorityPropertyName]: {
                "number": task.newPriority
            }
        },
    };

    await client.pages.update(request as unknown as PagesUpdateParameters);
};

main();