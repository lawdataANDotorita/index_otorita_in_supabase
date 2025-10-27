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
		const toIncludeTimes = true; // Set to true to track execution times
		if (toIncludeTimes) {
			results.timeStamps = {};
		}
		const docScores = {};
		var rerankedResponse={};

		let sModel="";
		let sMatchFunction="";
		let iChunksLength=0;

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
				sMatchFunction="return_most_similar_chunks_only_cohere_400";
				break;
			case "5"://cohere_1000
				sModel="cohere_1000";
				sMatchFunction="return_most_similar_chunks_only_cohere_1000";
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

	if (toIncludeTimes) {
		results.timeStamps.start = Date.now();
	}

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
		"בהתאם ל[חוק רלוונטי אם ישנו כזה. אל תכריח], [שאלה משפטית ספציפית]? [אם יש תנאים מיוחדים - הוסף: במקרה של [תנאי], האם יש שינוי?]"
		
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
				model: 'gpt-4.1',
				messages:messagesForOpenAI,
				temperature: 0,
				presence_penalty: 0,
				frequency_penalty: 0
			})
		response = chatCompletion.choices[0].message;
		newQuery=response.content;
		
		if (toIncludeTimes) {
			results.timeStamps.after_rewrite = Date.now();
		}
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

	if (toIncludeTimes) {
		results.timeStamps.after_embedding = Date.now();
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
			match_count: 50,
			p_dt:queryDate,
		});
	if (toIncludeTimes) {
		results.timeStamps.after_supabase = Date.now();
	}

	if (bIncludeLog){
		results.log+=" after calling supabase with query. date is - "+new Date().toISOString();
		results.vector=messages.vector;
	}
	if (error) {
		results.error=error;
	}

		let allParagraphsFoundConcat="";

		if (data) {
			/*
			  this one filters out the chunks that are not relevant to the query. 
			  i use lower threshhold to remove only the real unrelevant chunks. 
			  but we should take into accout the possibility that something will be 
			  less similar but more relevant
			*/
			const filteredData = data.filter(item => item.similarity >= 0.3);
			results.chunks = filteredData.map(item => {return {content:item.content,name_in_db:item.name_in_db,similarity:item.similarity,doc_name:item.doc_name};});
			
			
			results.chunks = data.map(item => {return {content:item.content,name_in_db:item.name_in_db,similarity:item.similarity,doc_name:item.doc_name};});
			allParagraphsFoundConcat=results.chunks.map(item => item.content).join(' ');
		}
		iChunksLength=data.length;
		results.generalMsg="";
		if (sModel.includes("cohere") && results.chunks && Array.isArray(results.chunks)) {
			if (results.chunks.length > 0) {
				
				/* we want to send to rerank a list of pseudo documents. by that i mean the each pseudo document will contain all the chunks returned from the database that share the same name_in_db. between each chunk there will be a separator consisting of newline and "===" and newline.
				here is an example of a pseudo document:
				===
				chunk 1
				===
				chunk 2
				===
				chunk 3
				===
				chunk 4
				*/
				// Group the chunks by 'name_in_db' (i.e., doc), and for each group,
				// concatenate the chunk contents, separated by "\n===\n", in original order.
				const pseudoDocuments = [];
				const docGroups = {};

				for (const chunk of results.chunks) {
					if (!docGroups[chunk.name_in_db]) {
						docGroups[chunk.name_in_db] = {arContent:[], name_in_db: chunk.name_in_db, doc_name: chunk.doc_name};
					}
					docGroups[chunk.name_in_db].arContent.push(chunk.content);
				}
				
				// Compose pseudo documents in order, preserving index order of chunks within docs
				const docOrder = Object.keys(docGroups); // No sort, preserve insertion
				for (const doc of docOrder) {
					// sort chunks as in returned order if needed, but already preserved
					const sContent = docGroups[doc].arContent.join('\n===\n');
					const pseudoDoc = {content: sContent, name_in_db: docGroups[doc].name_in_db, doc_name: docGroups[doc].doc_name};
					pseudoDocuments.push(pseudoDoc);
				}
				// The pseudoDocuments array can now be used for reranking, e.g.:
				// rerankedResponse = await oCohere.rerank({
				//     query: oNewQuery.question,
				//     documents: pseudoDocuments,
				//     ...
				// });

				
				
				try {
					rerankedResponse = await oCohere.rerank({
						query: oNewQuery.question,
						documents: 	pseudoDocuments.map(doc => doc.content),
						model: "rerank-multilingual-v3.0",
						topN: pseudoDocuments.length // Return all reranked
					});

					
				const filteredRerankedResponse=rerankedResponse.results.filter(item => item.relevanceScore >= 0.5);
				results.pseudoDocsRanked = filteredRerankedResponse.map(item => {
					return {
						...pseudoDocuments[item.index],
						score:item.relevanceScore || 0
					}
				});
				

				// Calculate aggregated scores by document
/*
				for (const chunk of results.chunksRanked) {
					const name_in_db = chunk.name_in_db;
					const doc_name = chunk.doc_name;
					const score = chunk.score || 0;
					if (!docScores[name_in_db]) {
						docScores[name_in_db] = {doc_name:doc_name,score:0};
					}
					docScores[name_in_db].score += score;
				}
*/
				// Only keep the top 5 name_in_db by highest aggregated relevance_score
				results.topRankedDocs = results.pseudoDocsRanked.slice(0, 5);
				results.uniqueNameInDb = [...new Set(results.topRankedDocs.map(item => item.name_in_db))];
				allParagraphsFoundConcat=""


				
				const sReturnChunksByNameFunction=sModel==="cohere_1000" ? "return_chunks_by_name_in_db_cohere_1000" : "return_chunks_by_name_in_db_cohere_400";

				const { data, error } = await supabase.rpc(sReturnChunksByNameFunction, {
					p_names_in_db: results.uniqueNameInDb.join(',')
				});
				if (error) {
					results.errorChunksByName = JSON.stringify({
						message: error.message,
						details: error.details,
						hint: error.hint,
						code: error.code
					});
				} else {
					results.chunks = data.map(item => {return {content:item.content,name_in_db:item.name_in_db,similarity:item.similarity,doc_name:item.doc_name};});
					allParagraphsFoundConcat=data.map(item => item.content).join(' ');
				}
			} catch (error) {
				results.generalMsg="Error reranking with Cohere:", error.message;
				// Continue without reranking if error occurs
			}
			finally {
				if (toIncludeTimes) {
					results.timeStamps.after_reranking = Date.now();
				}
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
			if (toIncludeTimes) {
				results.timeStamps.before_openai_stream = Date.now();
			}
			
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
				const arMostRelevantDocs=results.topRankedDocs || results.chunks;
				if (arMostRelevantDocs && Array.isArray(arMostRelevantDocs)) {
					for (const item of arMostRelevantDocs) {
						// INSERT_YOUR_CODE
						// Check if chunk.name_in_db is present in any of the arSources strings
						const isNameInSources = arSources.some(src => src.includes(item.doc_name));
						if (item.doc_name && !isNameInSources) {
							arSources.push(item.name_in_db+"*%*"+item.doc_name);
						}
					}
				}
				
			if (toIncludeTimes) {
				results.timeStamps.after_streaming = Date.now();
			}

			// Calculate and format durations
			let timesString = "";
			if (toIncludeTimes && results.timeStamps.start) {
				const ts = results.timeStamps;
				const durations = [];
				
				if (ts.start && ts.after_rewrite) {
					durations.push(`rewrite=${ts.after_rewrite - ts.start}ms`);
				}
				if (ts.after_rewrite && ts.after_embedding) {
					durations.push(`embed=${ts.after_embedding - ts.after_rewrite}ms`);
				}
				if (ts.after_embedding && ts.after_supabase) {
					durations.push(`supabase=${ts.after_supabase - ts.after_embedding}ms`);
				}
				if (ts.after_reranking && ts.after_supabase) {
					durations.push(`rerank=${ts.after_reranking - ts.after_supabase}ms`);
				}
				const beforeStream = ts.after_reranking || ts.after_supabase;
				if (beforeStream && ts.before_openai_stream) {
					durations.push(`openai=${ts.before_openai_stream - beforeStream}ms`);
				}
				if (ts.before_openai_stream && ts.after_streaming) {
					durations.push(`stream=${ts.after_streaming - ts.before_openai_stream}ms`);
				}
				
				if (durations.length > 0) {
					timesString = "^^^ times: " + durations.join(",");
				}
			}

			arSources.push("metadata_for_debug"+"*%*"+oNewQuery.question+"^^^"+oNewQuery.type+"^^^"+(parseInt(oNewQuery.type)===1 ? "gpt-4.1" : "gpt-4.1-mini")+"^^^"+sModel+
				(results.uniqueNameInDb && Array.isArray(results.uniqueNameInDb) && results.uniqueNameInDb.length>0 ? "^^^ uniqueNameInDb="+results.uniqueNameInDb.join(",") : "") + 
				(results.errorChunksByName ? "^^^ errorChunksByName="+results.errorChunksByName : "") +
				" ^^^ docScores="+JSON.stringify(docScores) +
				" ^^^ rerankedResponse="+JSON.stringify(rerankedResponse) +
				" ^^^ data chunks length="+iChunksLength +
				" ^^^ " + timesString
			);

//				arSources.push("222"+"*%*"+"length123="+results.chunks.length+" ^^^ "+ "generalMsg="+results.generalMsg);

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
