import dotenv from 'dotenv'

dotenv.config();

import { Client, LogLevel } from "@notionhq/client";

const main = async () => {
    const notion = new Client({
        auth: process.env.NOTION_TOKEN,
        logLevel: LogLevel.DEBUG,
    });

    const tasksDatabase = await notion.databases.retrieve({"database_id": "dae968ec2e6a4e15aec83a25c790b1a3"});

    console.log(tasksDatabase);
};

main();