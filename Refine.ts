import dotenv from "dotenv";
dotenv.config();

import { Client, LogLevel } from "@notionhq/client";
import { DatabasesQueryParameters, PagesUpdateParameters } from "@notionhq/client/build/src/api-endpoints";
import open from "open";
import prompt from "prompt";
import replace from 'lodash.replace';

const category = "Personal";
const categoryPropertyName = "Category";
const databaseID = "dae968ec2e6a4e15aec83a25c790b1a3";
const defaultCategory = "Personal";
const priorityPropertyName = "Priority";

class Task {
    name: string;
    pageID: string;
    originalPriority: number;
    newPriority: number;
    isRefined: boolean;
  
    constructor(pageID: string, name: string, priority: number, isRefined: boolean) {
        this.pageID = pageID;
        this.name = name;
        this.originalPriority = priority;
        this.newPriority = priority;
        this.isRefined = isRefined;
    }
  
    public static fromPage(page : any) {
        return new Task(
            page.id,
            page.properties.Name.title[0].plain_text,
            page.properties.Priority.number,
            page.properties.Refined.checkbox
        );
    }
}

const higherOrLowerPrompt = {
    properties: {
      higherOrLower: {
        message: 'Name must be only letters, spaces, or dashes',
        required: true
      }
    }
};

const main = async () => {
    const client = new Client({
        "auth": process.env.NOTION_TOKEN,
        "logLevel": LogLevel.DEBUG,
    });

    const tasks = await getTasks(client);

    // while(true){

        sortTasksByNewPriority(tasks);

        const firstNotRefinedTask = tasks.find(t => !t.isRefined);

        const tasksToRefine = tasks.filter(t => t.newPriority === firstNotRefinedTask?.newPriority);

        const otherTasks = tasks.filter(t => t.newPriority !== firstNotRefinedTask?.newPriority);

        const orderedUniquePrioritiesOfOtherTasks = getOrderedUniquePriorities(otherTasks);

        let lowestPriorityIndex = 0;
        let highestPriorityIndex = orderedUniquePrioritiesOfOtherTasks.length;

        while (highestPriorityIndex - lowestPriorityIndex > 1) {
            const thisRoundPriorityIndex = Math.floor((lowestPriorityIndex + highestPriorityIndex) / 2);

            const thisRoundOtherTasks = tasks.filter(t => t.newPriority === orderedUniquePrioritiesOfOtherTasks[thisRoundPriorityIndex]);

            tasksToRefine.forEach(t => console.log(t));

            console.log("================= VS. =================")

            thisRoundOtherTasks.forEach(t => console.log(t));

            const result = (await prompt.get([higherOrLowerPrompt])).higherOrLower;

            if (result === "h") {
                highestPriorityIndex = thisRoundPriorityIndex;
            }
            else {
                lowestPriorityIndex = thisRoundPriorityIndex;
            }

            console.log("=======================================")
        }

        const newPriority = (orderedUniquePrioritiesOfOtherTasks[highestPriorityIndex] + orderedUniquePrioritiesOfOtherTasks[lowestPriorityIndex]) / 2;

        tasksToRefine.forEach(t => t.newPriority = newPriority);

        tasksToRefine.forEach(t => console.log(t));
    
        for (const task of tasksToRefine) {
            await updatePriorityAndOpenUrl(client, task);
        }
    // }
};

const getOrderedUniquePriorities = (tasks : Task[]) => {
    const result = [...new Set(tasks.map(t => t.newPriority))];

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

        const categoryFilter = {
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

const updatePriorityAndOpenUrl = async (client : Client, task : Task) => {
    if (task.newPriority === task.originalPriority){
        console.log(`Task '${task.name}' already has a priority of ${task.originalPriority}.`);
    }
    else {
        console.log(`Update task '${task.name}' from ${task.originalPriority} to ${task.newPriority}.`);

        const request = {
            "page_id": task.pageID,
            "properties": {
                [priorityPropertyName]: {
                    "number": task.newPriority
                }
            },
        };

        const response = await client.pages.update(request as unknown as PagesUpdateParameters);
        
        console.log(response);
    }
    
    open(`https://www.notion.so/${replace(task.pageID, new RegExp("-","g"), "")}`);
};

main();

function sortTasksByNewPriority(tasks: Task[]) {
    tasks.sort((t1,t2) => t1.newPriority - t2.newPriority);
}
