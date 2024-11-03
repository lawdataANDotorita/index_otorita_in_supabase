/*

#1 - shay - 29/10/2024 - leave the user's query optimization out for now. it seems to confuse the embedding model

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

//#1
/*		
		chatCompletion = await oOpenAi.chat.completions.create({
			model: 'gpt-4o',
			messages:messagesForOpenAI,
			temperature: 1.1,
			presence_penalty: 0,
			frequency_penalty: 0
		})
		response = chatCompletion.choices[0].message;
		const newQuery=response.content;
*/
		const newQuery=messages.query;

		results.newQuery=newQuery;
		
		try {
			  response = await oOpenAi.embeddings.create({
			  model: "text-embedding-3-large",
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
			match_threshold: 0.5,
			match_count: 10
		});

		if (error) {
			results.error=error;
			results.vecroe=messages.vector;
		}

		let allParagraphsFoundConcat="";

		if (data) {
			results.chunks = data.map(item => {return {content:item.content,index_in_db:item.index_in_db,similarity:item.similarity};});
			allParagraphsFoundConcat=data.map(item => item.content).join(' ')
		}

		messagesForOpenAI = [
			{ role: 'system', content: "אתה מומחה ביחסי עבודה. תקבל שתי פיסות מידע: 1. הקשר שמכיל מידע על יחסי עבודה. 2. שאלה ביחסי עבודה. המטרה שלך היא לענות על השאלה אך ורק מתוך ההקשר שתקבל בחלק הראשון. אם אינך מצליח להרכיב את התשובה על סמך המידע שבחלק הראשון, תכתוב 'מצטער, אני לא יודע את התשובה לשאלה'. בבקשה אל תמציא תשובה."},
			{ role: 'user', content: `קונטקסט: ${allParagraphsFoundConcat}`},
			{ role: 'user', content: `שאלה: '${newQuery}'`} 
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
