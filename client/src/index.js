/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
	async fetch(request, env, ctx) {

		// Handle CORS preflight requests
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		const messages = await request.json();

		const oOpenAi = new OpenAI({
			apiKey:env.OPENAI_API_KEY,
			baseURL:"https://gateway.ai.cloudflare.com/v1/1719b913db6cbf5b9e3267b924244e58/query_db_gateway/openai"
		});
		var messagesForOpenAI;
		var response;
		var chatCompletion;
		const results={};
		
		//here call openai to transform your query to a more structured query
		messagesForOpenAI = [
			{ role: 'system', content: "אתה מומחה לדיני עבודה ועליך להרכיב לי מהשאלה שתקבל בשאילתה הבאה את השאילתה שתאפשר לך לענות בצורה הטובה ביותר על השאלה המקורית. תשכתב את השאלה בלבד, בלי הקדמות וסיומות. תודה: "},
			{ role: 'user', content: messages.query }
		];

		chatCompletion = await oOpenAi.chat.completions.create({
			model: 'gpt-4o',
			messages:messagesForOpenAI,
			temperature: 1.1,
			presence_penalty: 0,
			frequency_penalty: 0
		})
		response = chatCompletion.choices[0].message;
		const newQuery=response.content;

		results.newQuery=newQuery;
		
		try {
			  response = await oOpenAi.embeddings.create({
			  model: "text-embedding-ada-002",
			  input: newQuery
			});
			messages.vector = response.data[0].embedding;
		} 
		catch (error) {
			messages.vector=["Error generating embedding. erro is "+error];
		}

		const privateKey = env.SUPABASE_API_KEY;
		if (!privateKey) throw new Error(`Expected env var SUPABASE_API_KEY`);
		const url = env.SUPABASE_URL;

		if (!url) throw new Error(`Expected env var SUPABASE_URL`);
		const supabase = createClient(url, privateKey);

		const { data,error } = await supabase.rpc('match_documents', {
			query_embedding: Array.from(messages.vector),
			match_threshold: 0.8,
			match_count: 10
		});

		if (error) {
			results.error=error;
		}

		let allParagraphsFoundConcat="";

		if (data) {
			results.chunks = data.map(item => {return {content:item.content,index_in_db:item.index_in_db};});
			results.indexes_in_db = data.map(item => item.index_in_db);
			allParagraphsFoundConcat=data.map(item => item.content).join(' ')
		}

		messagesForOpenAI = [
			{ role: 'system', content: "אתה מומחה משפטי לדיני עבודה. אתה צריך לקבל את הפסקאות הבאות ולענות רק באמצעותן על השאלה שתופיע בשאילתה הבאה. הפסקאות הן: "+allParagraphsFoundConcat },
			{ role: 'user', content: newQuery }
		];

		chatCompletion = await oOpenAi.chat.completions.create({
			model: 'gpt-4o',
			messages:messagesForOpenAI,
			temperature: 1.1,
			presence_penalty: 0,
			frequency_penalty: 0
		})
		response = chatCompletion.choices[0].message;

		results.answer=response.content;

		return new Response(JSON.stringify(results),{headers:corsHeaders});
	}
};
