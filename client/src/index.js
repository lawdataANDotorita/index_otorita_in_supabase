/*

#1 - shay - 29/10/2024 - leave the user's query optimization out for now. it seems to confuse the embedding model

*/
import OpenAI from "openai";
import { VoyageAIClient } from "voyageai";
import { createClient } from "@supabase/supabase-js";
import { CohereClient } from "cohere-ai";

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
		const oVoyageAI = new VoyageAIClient({
			apiKey: env.VOYAGEAI_API_KEY
		});
		const oCohere = new CohereClient({
			token: env.COHERE_API_KEY
		});
		var messagesForOpenAI;
		var response;
		var chatCompletion;
		const results={};
		var bIncludeLog=false;


		let sModel="";
		let sMatchFunction="";

		switch (messages.model) {
			case "1"://voyage-multilingual-2
				sModel="voyage-multilingual-2";
				sMatchFunction="match_documents_new_voyage_multilingual_2";
				break;
			case "2"://voyage-3.5
				sModel="voyage-3.5";
				sMatchFunction="match_documents_new_voyage";
				break;
			case "3"://voayage-context-3
				sModel="voyage-context-3";
				sMatchFunction="match_documents_new_voyage_context_3";
				break;
			case "4"://cohere
				sModel="cohere";
				sMatchFunction="match_documents_new_cohere_400_with_relevant_chunks_emphasized";
				break;
			case "5"://cohere_1000
				sModel="cohere_1000";
				sMatchFunction="match_documents_new_cohere_1000_with_relevant_chunks_emphasized";
				break;
			default:
				sModel="openai-text-embedding-3-large";
				sMatchFunction="match_documents_new";
		
		}

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

			const PROMPT_REWRITE = `אתה מומחה ליחסי עבודה ושכר בישראל. תפקידך לנרמל שאלות משתמש לפורמט אחיד.
הוראות קריטיות:
1. התעלם לחלוטין ממילות נימוס, ברכות או פתיחות (שלום, תודה, בבקשה וכו')
2. חלץ רק את ליבת השאלה המשפטית
3. שמור על המבנה הבא בדיוק:

עבור כל שאלה, זהה:
- הנושא המשפטי המרכזי
- העובדות הספציפיות (סכומים, תקופות, סטטוס עובד)
- השאלה המשפטית המדויקת

תבנית השאלה המנורמלת:
"בהתאם ל[חוק רלוונטי], [שאלה משפטית ספציפית]? [אם יש תנאים מיוחדים - הוסף: במקרה של [תנאי], האם יש שינוי?]"

כללים נוספים:
- אם השאלה כמותית אז היא דורשת חישוב. במקרה הזה הוסף: "יש לבצע חישוב מפורט ולהציג את שלבי החישוב"
- אל תוסיף בקשות כלליות כמו "פרט את ההקשר" או "הסבר את הזכויות והחובות" אלא אם המשתמש ביקש זאת במפורש
- שמור על אורך שאלה מינימלי - אל תרחיב מעבר להכרחי

סוג השאלה:
- כמותית (1): התשובה היא מספר, אחוז, סכום או תחשיב
- איכותית (0): התשובה היא הסבר משפטי או הנחיות

פורמט פלט - JSON בלבד:
{
  "question": "[השאלה המנורמלת]",
  "type": 0 או 1
}
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

		switch (sModel) {
			case "cohere":
			case "cohere_1000":
				try {
					response = await oCohere.embed({
					texts: [oNewQuery.question],
					model: "embed-multilingual-v3.0",
					input_type: "search_query"
					});
					messages.vector = response.embeddings[0];
				} 
				catch (error) {
					messages.vector=["Error generating embedding. error is "+error];
				}
				break;
			case "voyage-multilingual-2":
			case "voyage-3.5":
				try {
					response = await oVoyageAI.embed({
					input: oNewQuery.question,
					model: sModel
					});
					messages.vector = response.data[0].embedding;
				} 
				catch (error) {
					messages.vector=["Error generating embedding. error is "+error];
				}
				break;
			case "voyage-context-3":
				try {
					response = await fetch("https://api.voyageai.com/v1/contextualizedembeddings", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Authorization": `Bearer ${env.VOYAGEAI_API_KEY}`, // The API key is passed in the header
					},
					body: JSON.stringify({
							inputs: [[oNewQuery.question]],
							model: sModel,
						}),
					});
				
					if (!response.ok) {
						const errorBody = await response.json();
						throw new Error(`HTTP error 4! Status: ${response.status}, Details: ${JSON.stringify(errorBody)}`);
					}

					const data = await response.json();
					messages.vector=data.data[0].data[0].embedding;
				} catch (error) {
					throw new Error(`voyageai error 4: ${error.message}`);
				}
				break;

			default:
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
				break;
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



		const sMatchDocumentsFunction=messages.history!==undefined ? sMatchFunction : "match_documents_test";
		const { data,error } = await supabase.rpc(sMatchDocumentsFunction, {
			query_embedding: messages.vector,
			match_threshold: 0.5,
			match_count: 30,
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
			results.chunks = data.map(item => {return {content:item.content,name_in_db:item.name_in_db,similarity:item.similarity,doc_name:item.doc_name,is_high_similarity:item.is_high_similarity};});
			allParagraphsFoundConcat=data.map(item => item.content).join(' ');
		}

		results.generalMsg="";
		results.highSimilarityNamesInDb=[];
		let rankedIndices = [];
		let medalsNameInDb = [];
		let highSimilarityChunks = [];
		// Rerank high similarity chunks using Cohere
		if (sModel.includes("cohere") && results.chunks && Array.isArray(results.chunks)) {
			
			
			// Add name_in_db of high similarity chunks to results.highSimilarityNamesInDb
			highSimilarityChunks = results.chunks.filter(chunk => chunk.is_high_similarity == 1);
			results.highSimilarityNamesInDb = highSimilarityChunks
				.map(chunk => chunk.name_in_db);

			if (highSimilarityChunks.length > 0) {
				try {
					const rerankedResponse = await oCohere.rerank({
						query: oNewQuery.question,
						documents: highSimilarityChunks.map(chunk => chunk.content),
						model: "rerank-multilingual-v3.0",
						topN: 5 /*highSimilarityChunks.length // Return all reranked*/
					});
					// rerankedResponse contains the reranked results, i.e. rerankedResponse.results is an array of {index, relevanceScore}
					// We want to extract the top 3 ranked chunks according to cohere's rerank response.
					// Then, collect all chunks (from results.chunks) that share the name_in_db property with each of the 3, maintaining order (gold, silver, bronze).

					// 1. Get name_in_db for each of the 3 ranked chunks, in order (gold, silver, bronze)
					rankedIndices = rerankedResponse.results.map(r => r.index); // cohere docs: index is from input docs array (highSimilarityChunks)
					medalsNameInDb = rankedIndices.map(idx => highSimilarityChunks[idx].name_in_db);

					// 2. Gather all chunks (from results.chunks) that share each name_in_db, in order, no duplicates in order
					const foundChunksByMedals = [];

					medalsNameInDb.forEach(nameInDb => {
						const matchingChunks = results.chunks.filter(chunk => chunk.name_in_db === nameInDb);
						foundChunksByMedals.push(...matchingChunks);
					});

					// foundChunksByMedals now has all the chunks for 'gold' doc, then 'silver', then 'bronze'
					// If you want to remove duplicates (in content), you can apply further filtering

					results.topRankedDocs = foundChunksByMedals;
					allParagraphsFoundConcat=foundChunksByMedals.map(item => item.content).join(' ');
				} catch (error) {
					results.generalMsg="Error reranking with Cohere:", error.message;
					// Continue without reranking if error occurs
				}
			}
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
			- תן תשובה מדויקת, מפורטת ומקצועית כמומחה בתחום
			- אם השאלה היא שאלה כמותית המבקשת למצוא מספר או סכום אנא פרט וציין שלב אחר שלב בדרך לתשובה. היה מפורט ככל האפשר
			- תניח שהמשתמש מבין בתחום יחסי העבודה והשכר ואל תסביר דברים מהיסודות של התחום

			3. אם המידע חסר או לא מספיק: כתב בדיוק את המשפט הבא: "איני יכול לתת תשובה מדויקת בהתבסס על המידע שברשותי"

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
				  model: parseInt(oNewQuery.type)===1 ? "gpt-4.1" : "gpt-4.1-mini",
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
				const arChunks=results.topRankedDocs || results.chunks;
				if (arChunks && Array.isArray(arChunks)) {
					for (const chunk of arChunks) {
						// INSERT_YOUR_CODE
						// Check if chunk.name_in_db is present in any of the arSources strings
						const isNameInSources = arSources.some(src => src.includes(chunk.doc_name));
						if (chunk.doc_name && !isNameInSources) {
							arSources.push(chunk.name_in_db+"*%*"+chunk.doc_name);
						}
					}
				}
				
				arSources.push("111"+"*%*"+oNewQuery.question+"^^^"+oNewQuery.type+"^^^"+(parseInt(oNewQuery.type)===1 ? "gpt-4.1" : "gpt-4.1-mini")+"^^^"+sModel+
					(rankedIndices.length>0 ? "^^^ rankedindices="+rankedIndices.join("***") : "")   +
					(medalsNameInDb.length>0 ? "^^^ medalsnameindb="+medalsNameInDb.join("***") : "")
				);

//				arSources.push("222"+"*%*"+"length123="+highSimilarityChunks.length+" ^^^ "+ "generalMsg="+results.generalMsg);

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
