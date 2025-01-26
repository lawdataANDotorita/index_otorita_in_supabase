/*

#1 - shay - 29/10/2024 - leave the user's query optimization out for now. it seems to confuse the embedding model

*/
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache',
	'Connection': 'keep-alive'
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

		const orgQuery=messages.query;
		var newQuery=messages.query;
		
		
		if (0==1){
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
			newQuery=response.content;
		}
		else if (0==1){
			//here call openai to extract keywords from the query
			messagesForOpenAI = [
				{ role: 'system', content: "אתה מומחה לדיני עבודה. אתה הולך לקבל בפרומפט הבא שאלה שקשורה לתחום יחסי העבודה. אני מבקש שתזקק מתוך השאלה את מילות המפתח, מילים שרלוונטיות לתחום יחסי העבודה. את התשובה תנסח באופן הבא: קודם את המחרוזת 'מילות מפתח:' ואחר-כך רשימה של מילות המפתח מופרדת על ידי פסיקים"},
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
			newQuery=response.content;
		}
		else{
			newQuery=messages.query;
		}

		results.newQuery=newQuery;
		results.log="";

		results.log+=" before calling create embedding with query. date is - "+new Date().toISOString();
		try {
			  response = await oOpenAi.embeddings.create({
			  model: "text-embedding-3-large",
			  input: newQuery,
			  dimensions: 1536,
			});
			messages.vector = response.data[0].embedding;
		} 
		catch (error) {
			messages.vector=["Error generating embedding. erro is "+error];
		}

		results.log+=" before calling supabase with query. before take 1. date is - "+new Date().toISOString();

		const privateKey = env.SUPABASE_API_KEY;
		if (!privateKey) throw new Error(`Expected env var SUPABASE_API_KEY`);
		const url = env.SUPABASE_URL;

		if (!url) throw new Error(`Expected env var SUPABASE_URL`);
		const supabase = createClient(url, privateKey);

		results.log+=" before calling supabase with query. before take 2. date is - "+new Date().toISOString();

		const { data,error } = await supabase.rpc('match_documents', {
			query_embedding: Array.from(messages.vector),
			match_threshold: 0.3,
			match_count: 30,
		});
		results.log+=" after calling supabase with query. date is - "+new Date().toISOString();
		results.vector=messages.vector;

		if (error) {
			results.error=error;
		}

		let allParagraphsFoundConcat="";

		if (data) {
			results.chunks = data.map(item => {return {content:item.content,index_in_db:item.index_in_db,similarity:item.similarity};});
			allParagraphsFoundConcat=data.map(item => item.content).join(' ')
		}

		messagesForOpenAI = [
//			{ role: 'system', content: "אתה הולך לקבל שתי שאילתות. הראשונה קונטקסט והשנייה שאלה. כמומחה ליחסי עבודה, אנא ענה על השאלה תוך התבססות בלעדית  על הקונטקסט. רם ריך תשובה תענה תשובה חלקית או תובנות אחרות שניתןל להפיק מהטקסט ושקשורות בעקיפין לשאלה"},
			{ role: 'system', content: "אתה מומחה ביחסי עבודה. אני אשלח לך שני קטעים. הראשון הוא קונטקסט שמכיל מידע והשני הוא שאלה. אתה צריך לענות, כמומחה ליחסי עבודה, על השאלה, שהיא שאלה מתחום יחסי העבודה, רק בהתבסס על המידע שבקונטקסט. אם לא תוכל, תכתוב שאינך יכול לתת תשובה מדויקת בהתבסס על המידע שברשותך."},

			{ role: 'user', content: `קונטקסט: ${allParagraphsFoundConcat}`},
			{ role: 'user', content: `שאלה: '${orgQuery}'`} 
		];

		results.log+=" before calling openai with query and data. date is - "+new Date().toISOString();

		const stream = new ReadableStream({
			async start(controller) {
			  const encoder = new TextEncoder();
			  try {
				// Call OpenAI with stream:true.
				const chatCompletion = await oOpenAi.chat.completions.create({
				  model: "gpt-4o",
				  messages: messagesForOpenAI,
				  temperature: 0,
				  presence_penalty: 0,
				  frequency_penalty: 0,
				  stream: true
				});
	  
	  
				// for await...of will yield each streamed chunk.
				for await (const chunk of chatCompletion) {
				  
				 const content = chunk?.choices?.[0]?.delta?.content || '';
				  // Log for debugging, but remove if you want.
				  console.log("Streaming chunk from OpenAI:", content);
				  // enqueue the chunk to the client.
				  controller.enqueue(encoder.encode(content));
				}
	  
				controller.close();
			  } catch (error) {
				// If there's an error, report it and signal failure.
				console.error("Error during OpenAI streaming:", error);
				controller.error(error);
			  }
			}
		  });
		  return new Response(stream, {
			headers: corsHeaders
		  });
	}
};
