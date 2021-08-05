import dotenv from "dotenv";
dotenv.config();

import { Client, LogLevel } from "@notionhq/client";
import { DatabasesQueryParameters, PagesUpdateParameters } from "@notionhq/client/build/src/api-endpoints";
import chalk from "chalk";
import open from "open";
import prompt from "prompt";
import replace from 'lodash.replace';

let category = "Personal";

const categoryPropertyName = "Category";
const databaseID = "dae968ec2e6a4e15aec83a25c790b1a3";
const defaultCategory = "Personal";
const priorityPropertyName = "Priority";
const refinedPropertyName = "Refined";

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
        let priority = page.properties.Priority?.number ?? -0.5;

        return new Task(
            page.id,
            page.properties.Name.title[0].plain_text,
            priority,
            page.properties[refinedPropertyName].checkbox
        );
    }

    public toString(){
        return `${this.name} - ${this.newPriority}`;
    }
}

const main = async () => {

    category = process.argv.splice(2)[0];

    const client = new Client({
        "auth": process.env.NOTION_TOKEN,
        "logLevel": LogLevel.DEBUG,
    });

    const tasks = await getTasks(client);

    while(true){

        sortTasksByNewPriority(tasks);

        const firstNotRefinedTask = tasks.find(t => !t.isRefined) as Task;

        if (firstNotRefinedTask === undefined){
            console.log("All tasks are refined.");
            break;
        }

        const firstNotRefinedTaskPriority = firstNotRefinedTask?.newPriority;

        const tasksToRefine = firstNotRefinedTaskPriority === undefined || firstNotRefinedTaskPriority <= 0
            ? [firstNotRefinedTask]
            : tasks.filter(t => t.newPriority === firstNotRefinedTaskPriority);

        const otherTasks = tasks.filter(t => 
            t.newPriority !== undefined && t.newPriority > 0 && t.newPriority !== firstNotRefinedTaskPriority
        );

        otherTasks.unshift(new Task("", "Placeholder first task", 0, false));
        otherTasks.push(new Task("", "Placeholder last task", otherTasks.slice(-1)[0].newPriority + 1, false));

        const orderedUniquePrioritiesOfOtherTasks = getOrderedUniquePriorities(otherTasks);

        let lowestPriorityIndex = 0;
        let highestPriorityIndex = orderedUniquePrioritiesOfOtherTasks.length;

        while (highestPriorityIndex - lowestPriorityIndex > 1) {

            console.log(chalk.grey("==============================================="));

            const thisRoundPriorityIndex = Math.floor((lowestPriorityIndex + highestPriorityIndex) / 2);

            const thisRoundOtherTasks = tasks.filter(t => t.newPriority === orderedUniquePrioritiesOfOtherTasks[thisRoundPriorityIndex]);

            tasksToRefine.forEach(t => console.log(chalk.blue(t.toString())));

            console.log(chalk.yellow("===================== vs. ====================="));

            thisRoundOtherTasks.forEach(t => console.log(chalk.green(t.toString())));

            const result = (await prompt.get([promptSchema])).result;

            if (result === "h") {
                highestPriorityIndex = thisRoundPriorityIndex;
            }
            else if (result === "l") {
                lowestPriorityIndex = thisRoundPriorityIndex;
            }
            else if (result === "s") {
                highestPriorityIndex = thisRoundPriorityIndex;
                lowestPriorityIndex = thisRoundPriorityIndex;
            }
            else {
                process.exit(0);
            }
        }

        const newPriority = (orderedUniquePrioritiesOfOtherTasks[highestPriorityIndex] + orderedUniquePrioritiesOfOtherTasks[lowestPriorityIndex]) / 2;

        tasksToRefine.forEach(t => t.newPriority = newPriority);
    
        for (const task of tasksToRefine) {
            await updateTaskAndOpenUrl(client, task);
        }

        tasksToRefine.forEach(t => t.isRefined = true);
    }
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

        request.filter = categoryFilter;

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

const sortTasksByNewPriority = (tasks: Task[]) => {
    tasks.sort((t1,t2) => t1.newPriority - t2.newPriority);
};

const updateTaskAndOpenUrl = async (client : Client, task : Task) => {

    if (task.newPriority === task.originalPriority){
        console.log(`Task '${task.name}' already has a priority of ${task.originalPriority}.`);
    }
    else {
        console.log(`Update task '${task.name}' from ${task.originalPriority} to ${task.newPriority}.`);
    }

    const request = {
        "page_id": task.pageID,
        "properties": {
            [priorityPropertyName]: {
                "number": task.newPriority
            },
            [refinedPropertyName]: {
                "checkbox": true
            }
        },
    };

    await client.pages.update(request as unknown as PagesUpdateParameters);
        
    open(`https://www.notion.so/${replace(task.pageID, new RegExp("-","g"), "")}`);
};

main();