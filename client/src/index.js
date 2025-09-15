/*

#1 - shay - 29/10/2024 - leave the user's query optimization out for now. it seems to confuse the embedding model

*/
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
	'Access-Control-Allow-Origin': 'https://otorita.net',
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

		let messages;
		try {
			messages = await request.json();
		} catch (error) {
			// If JSON parsing fails, use a default query
			messages = {query: "מה השער היציג של 100 יין יפני בתאריך ה 02/01/2025 ?",history:[]};
		}

		const oOpenAi = new OpenAI({
			apiKey:env.OPENAI_API_KEY,
			baseURL:"https://gateway.ai.cloudflare.com/v1/1719b913db6cbf5b9e3267b924244e58/query_db_gateway/openai"
		});
		var messagesForOpenAI;
		var response;
		var chatCompletion;
		const results={};
		var bIncludeLog=false;
		const orgQuery=messages.query;

		var newQuery="";
		var arHistory = messages.history!==undefined ? messages.history : [];
		if (Array.isArray(arHistory)) {
			for (const item of arHistory) {
				if (item.role === "user" && typeof item.content === "string") {
					// Add a newline and then the content to newQuery
					newQuery += "\n" + item.content;
				}
			}
		}
		
		newQuery +=!!newQuery ? ("\n"+messages.query) : messages.query;

		if (1==1){

			const PROMPT_REWRITE = `אתה מומחה ליחסי עבודה ושכר בישראל. עליך לבצע שתי משימות:
שכתוב שאלה: שכתב את השאלה שתקבל כך שתהיה ברורה, ספציפית ומכילה את כל הפרטים הרלוונטיים הדרושים למתן תשובה מדויקת ומלאה. ודא שהשאלה כוללת הקשר משפטי וחוקי מתאים.
אם השאלה כמותית אנא נסח את השאלה כך שתבהיר לבינה המלאכותית שעליה להשתמש בחישובים המתאימים כדי להגיע לתשובה ושעליה לפרט את החישובים שעשתה
2. ציין את סוג השאלה: 
האם זו שאלה כמותית - אם התשובה היא מספר, אחוז, סכום כסף או תחשיב מדויק
האם זו שאלה איכותיח - אם התשובה היא הסבר, הנחיות או ניתוח משפטי.
החזר JSON עם שני משתנים:
1. quesion - תוכן השאלה המשוכתבת כפי שהיא בלי הקדמות או סיומות
2. type: 
אם זו שאלה איכותית החזר 0. 
אם זו שאלה כמותית החזר 1
`;
			//here call openai to transform your query to a more structured query
			messagesForOpenAI = [
				{ role: 'system', content: PROMPT_REWRITE},
				{ role: 'user', content: messages.query }
			];
			chatCompletion = await oOpenAi.chat.completions.create({
				model: 'gpt-4.1-mini',
				messages:messagesForOpenAI,
				temperature: 0,
				presence_penalty: 0,
				frequency_penalty: 0
			})
			response = chatCompletion.choices[0].message;
			newQuery=response.content;
		}
		else if (0==1){
			//here call openai to extract keywords from the query
			messagesForOpenAI = [
				{ role: 'system', content: "אתה מומחה לדיני עבודה. אתה הולך לקבל בפרומפט הבא שאלה שקשורה לתחום יחסי עבודה ושכר. אני מבקש שתזקק מתוך השאלה את מילות המפתח, מילים שרלוונטיות לתחום יחסי עבודה ושכר. את התשובה תנסח באופן הבא: קודם את המחרוזת 'מילות מפתח:' ואחר-כך רשימה של מילות המפתח מופרדת על ידי פסיקים"},
				{ role: 'user', content: messages.query }
			];
			chatCompletion = await oOpenAi.chat.completions.create({
				model: 'gpt-4.1-mini',
				messages:messagesForOpenAI,
				temperature: 1.1,
				presence_penalty: 0,
				frequency_penalty: 0
			})
			response = chatCompletion.choices[0].message;
			newQuery=response.content;
		}

		results.newQuery=newQuery;
		results.log="";
		const oNewQuery=JSON.parse(newQuery);

		// Check for date in dd/MM/yyyy format in query
		const dateRegex = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
		const dateMatch = messages.query.match(dateRegex);
		let queryDate = null;
		
		if (dateMatch) {
			queryDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
		}
		


		if (bIncludeLog){
			results.log+=" before calling create embedding with query. date is - "+new Date().toISOString();
		}
		try {
			  response = await oOpenAi.embeddings.create({
			  model: "text-embedding-3-large",
			  input: oNewQuery.question,
			  dimensions: 1536,
			});
			messages.vector = response.data[0].embedding;
		} 
		catch (error) {
			messages.vector=["Error generating embedding. erro is "+error];
		}

		if (bIncludeLog){
			results.log+=" before calling supabase with query. before take 1. date is - "+new Date().toISOString();
		}

		const privateKey = env.SUPABASE_API_KEY;
		if (!privateKey) throw new Error(`Expected env var SUPABASE_API_KEY`);
		const url = env.SUPABASE_URL;

		if (!url) throw new Error(`Expected env var SUPABASE_URL`);
		const supabase = createClient(url, privateKey);

		if (bIncludeLog){
			results.log+=" before calling supabase with query. before take 2. date is - "+new Date().toISOString();
		}



		const sMatchDocumentsFunction=messages.history!==undefined ? "match_documents_new" : "match_documents_test";
		const { data,error } = await supabase.rpc(sMatchDocumentsFunction, {
			query_embedding: messages.vector,
			match_threshold: 0.5,
			match_count: 10,
			p_dt:queryDate,
		});
		if (bIncludeLog){
			results.log+=" after calling supabase with query. date is - "+new Date().toISOString();
			results.vector=messages.vector;
		}
		if (error) {
			results.error=error;
		}

		let allParagraphsFoundConcat="";

		if (data) {
			results.chunks = data.map(item => {return {content:item.content,name_in_db:item.name_in_db,similarity:item.similarity,doc_name:item.doc_name};});
			allParagraphsFoundConcat=data.map(item => item.content).join(' ')
		}

		const EXPERT_PROMPT = `אתה מומחה מוביל ביחסי עבודה ודיני עבודה בישראל.

			הוראות עבודה:

			1. קריאת החומר: אני אשלח לך שני חלקים נפרדים:
			- קונטקסט: מידע רקע ונתונים רלוונטיים
			- שאלה: שאלה ספציפית בתחום יחסי העבודה והשכר

			2. דרישות התשובה:
			- ענה על השאלה אך ורק בהתבסס על המידע שבקונטקסט
			- אל תוסיף מידע חיצוני או ידע כללי שלך
			- אל תנחש או תשער מעבר למידע הנתון
			- תן תשובה מדויקת, תמציתית ומקצועית כמומחה בתחום
			- תניח שהמשתמש מבין בתחום יחסי העבודה והשכר ואל תסביר דברים מהיסודות של התחום

			3. אם המידע לא מספיק: כתב בדיוק את המשפט הבא: "איני יכול לתת תשובה מדויקת בהתבסס על המידע שברשותי"

			4. עיצוב התשובה:
			- חשוב מאוד: אל תשתמש בשום סימון עיצוב או מארקאפ
			- אל תשתמש בכוכביות, קו תחתון, או כל סימן עיצוב אחר
			- כתב בטקסט רגיל בלבד ללא עיצובים
			- אל תשתמש ברשימות מסומנות או ממוספרות
			- אל תשתמש בכותרות מעוצבות
			- מותר ורצוי להשתמש בירידות שורה להפרדה בין נושאים

			5. רמת המקצועיות: השתמש בשפה מקצועית מדויקת של מומחה ביחסי עבודה ודיני עבודה`;


		messagesForOpenAI = [
			{ role: 'system', content:EXPERT_PROMPT},
			...arHistory,
			{ role: 'user', content: `קונטקסט: ${allParagraphsFoundConcat}`},
			{ role: 'user', content: `שאלה: '${oNewQuery.question}'`} 
		];

		if (bIncludeLog){
			results.log+=" before calling openai with query and data. date is - "+new Date().toISOString();
		}

		const stream = new ReadableStream({
			async start(controller) {
			  const encoder = new TextEncoder();
			  try {
				// Call OpenAI with stream:true.
				const chatCompletion = await oOpenAi.chat.completions.create({
				  model: parseInt(oNewQuery.type)===1 ? "gpt-4.1-mini" : "gpt-4.1-mini",
				  messages: messagesForOpenAI,
				  temperature:0,
				  presence_penalty: 0,
				  frequency_penalty: 0,
				  stream: true
				});
	  
				if (bIncludeLog){
					results.log+=" after calling openai with query and data. before statring to stream. date is - "+new Date().toISOString();
				}
	  
				// for await...of will yield each streamed chunk.
				for await (const chunk of chatCompletion) {
				  
				 const content = chunk?.choices?.[0]?.delta?.content || '';
				  // Log for debugging, but remove if you want.
				  //console.log("Streaming chunk from OpenAI:", content);
				  // enqueue the chunk to the client.
				  controller.enqueue(encoder.encode(content));
				}

				// Stream the initial results object
//				controller.enqueue(encoder.encode(`*&* ${JSON.stringify(results)}\n\n`));


				let arSources = [];
				if (results.chunks && Array.isArray(results.chunks)) {
					for (const chunk of results.chunks) {
						// INSERT_YOUR_CODE
						// Check if chunk.name_in_db is present in any of the arSources strings
						const isNameInSources = arSources.some(src => src.includes(chunk.doc_name));
						if (chunk.doc_name && !isNameInSources) {
							arSources.push(chunk.name_in_db+"*%*"+chunk.doc_name);
						}
					}
				}
				arSources.push("111"+"*%*"+oNewQuery.question+"^^^"+oNewQuery.type+"^^^"+(parseInt(oNewQuery.type)===1 ? "gpt-4.1-mini" : "gpt-4.1-mini"));

				if (arSources.length>0){
					controller.enqueue(encoder.encode(`*^*${arSources.join("*&*")}`));
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
