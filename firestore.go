package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"strconv"
)

const ProjectId = "gemini-dutch-practice-latest"
const ProdDatabaseId = "gemini-dutch-practice-v1"
const EmulatorDatabaseId = "(default)"

type Word struct {
	Id                  string                 `json:"id"`
	Dutch               string                 `json:"dutch"`
	English             string                 `json:"english"`
	Context             string                 `json:"context,omitempty"`
	AddedAt             int64                  `json:"addedAt"`
	CreatorId           string                 `json:"creatorId"`
	Examples            []interface{}          `json:"examples,omitempty"`
	SrsLevel            int                    `json:"srsLevel"`
	NextReviewAt        int64                  `json:"nextReviewAt"`
	WordAudioUrl        string                 `json:"wordAudioUrl,omitempty"`
	WordTeacherAudioUrl string                 `json:"wordTeacherAudioUrl,omitempty"`
}

type BatchGetResult struct {
	Found    *FirestoreDocument `json:"found,omitempty"`
	Missing  string             `json:"missing,omitempty"`
	ReadTime string             `json:"readTime"`
}

type FirestoreDocument struct {
	Name       string                 `json:"name"`
	Fields     map[string]interface{} `json:"fields"`
	CreateTime string                 `json:"createTime"`
	UpdateTime string                 `json:"updateTime"`
}

func parseWordFromFields(wordId string, fields map[string]interface{}) Word {
	dutchVal := ""
	if obj, exists := fields["dutch"].(map[string]interface{}); exists {
		dutchVal, _ = obj["stringValue"].(string)
	}

	englishVal := ""
	if obj, exists := fields["english"].(map[string]interface{}); exists {
		englishVal, _ = obj["stringValue"].(string)
	}

	contextVal := ""
	if obj, exists := fields["context"].(map[string]interface{}); exists {
		contextVal, _ = obj["stringValue"].(string)
	}

	addedAtVal := int64(0)
	if obj, exists := fields["addedAt"].(map[string]interface{}); exists {
		if str, ok := obj["integerValue"].(string); ok {
			addedAtVal, _ = strconv.ParseInt(str, 10, 64)
		}
	}

	creatorIdVal := ""
	if obj, exists := fields["creatorId"].(map[string]interface{}); exists {
		creatorIdVal, _ = obj["stringValue"].(string)
	}

	examplesList := make([]interface{}, 0)
	if obj, exists := fields["examples"].(map[string]interface{}); exists {
		if arrayVal, ok := obj["arrayValue"].(map[string]interface{}); ok {
			if values, ok := arrayVal["values"].([]interface{}); ok {
				examplesList = values
			}
		}
	}

	wordAudioUrlVal := ""
	if obj, exists := fields["wordAudioUrl"].(map[string]interface{}); exists {
		wordAudioUrlVal, _ = obj["stringValue"].(string)
	}

	wordTeacherAudioUrlVal := ""
	if obj, exists := fields["wordTeacherAudioUrl"].(map[string]interface{}); exists {
		wordTeacherAudioUrlVal, _ = obj["stringValue"].(string)
	}

	return Word{
		Id:                  wordId,
		Dutch:               dutchVal,
		English:             englishVal,
		Context:             contextVal,
		AddedAt:             addedAtVal,
		CreatorId:           creatorIdVal,
		Examples:            examplesList,
		WordAudioUrl:        wordAudioUrlVal,
		WordTeacherAudioUrl: wordTeacherAudioUrlVal,
	}
}

const FirebaseApiKey = "AIzaSyA2MKBe2T3kuaPtHSpze2Dsq3VRmbnfqTo"

type FirestoreClient struct {
	idToken          string
	refreshToken     string
	uid              string
	useEmulator      bool
	emulatorHost     string
	onTokenRefreshed func(newIdToken, newRefreshToken string)
}

func NewFirestoreClient(idToken, refreshToken, uid string, useEmulator bool, emulatorHost string, onTokenRefreshed func(newIdToken, newRefreshToken string)) *FirestoreClient {
	if emulatorHost == "" {
		emulatorHost = "127.0.0.1"
	}
	return &FirestoreClient{
		idToken:          idToken,
		refreshToken:     refreshToken,
		uid:              uid,
		useEmulator:      useEmulator,
		emulatorHost:     emulatorHost,
		onTokenRefreshed: onTokenRefreshed,
	}
}

// GetDocumentResourceName returns a fully qualified resource name for a document
func (fc *FirestoreClient) GetDocumentResourceName(collection, docId string) string {
	dbId := ProdDatabaseId
	if fc.useEmulator {
		dbId = EmulatorDatabaseId
	}
	return fmt.Sprintf("projects/%s/databases/%s/documents/%s/%s", ProjectId, dbId, collection, docId)
}


type RefreshResponse struct {
	ExpiresIn    string `json:"expires_in"`
	TokenType    string `json:"token_type"`
	RefreshToken string `json:"refresh_token"`
	IdToken      string `json:"id_token"`
	UserId       string `json:"user_id"`
	ProjectId    string `json:"project_id"`
}

// RefreshToken exchanges the refresh token for a new idToken
func (fc *FirestoreClient) RefreshToken() (string, error) {
	if fc.refreshToken == "" {
		return "", fmt.Errorf("no refresh token available")
	}

	if fc.useEmulator {
		return fc.idToken, nil
	}

	tokenUrl := fmt.Sprintf("https://securetoken.googleapis.com/v1/token?key=%s", FirebaseApiKey)
	
	data := url.Values{}
	data.Set("grant_type", "refresh_token")
	data.Set("refresh_token", fc.refreshToken)

	resp, err := http.PostForm(tokenUrl, data)
	if err != nil {
		return "", fmt.Errorf("failed to make token refresh request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return "", fmt.Errorf("token refresh API returned status %d: %s", resp.StatusCode, string(body))
	}

	var refreshRes RefreshResponse
	if err := json.NewDecoder(resp.Body).Decode(&refreshRes); err != nil {
		return "", fmt.Errorf("failed to decode refresh response: %v", err)
	}

	if refreshRes.IdToken == "" {
		return "", fmt.Errorf("refresh response contained empty ID token")
	}

	// Update cached tokens
	fc.idToken = refreshRes.IdToken
	if refreshRes.RefreshToken != "" {
		fc.refreshToken = refreshRes.RefreshToken
	}

	// Propagate back to parent if callback registered
	if fc.onTokenRefreshed != nil {
		fc.onTokenRefreshed(fc.idToken, fc.refreshToken)
	}

	return fc.idToken, nil
}

// doRequest executes an HTTP request, and if it receives a 401 Unauthorized status,
// it refreshes the token once and retries the request before returning the response.
func (fc *FirestoreClient) doRequest(method, url string, body []byte) (*http.Response, error) {
	req, err := fc.GetRequest(method, url, body)
	if err != nil {
		return nil, err
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}

	// If we got 401 Unauthorized in production, try to refresh the token and retry once
	if !fc.useEmulator && resp.StatusCode == http.StatusUnauthorized && fc.refreshToken != "" {
		resp.Body.Close() // Close the current unauthorized body

		fmt.Println("[FirestoreClient] 401 Unauthorized received. Attempting token refresh...")
		if _, refreshErr := fc.RefreshToken(); refreshErr != nil {
			return nil, fmt.Errorf("failed to refresh token after 401: %v", refreshErr)
		}

		// Recreate the request with the new token
		req, err = fc.GetRequest(method, url, body)
		if err != nil {
			return nil, err
		}

		fmt.Println("[FirestoreClient] Retrying request with fresh token...")
		resp, err = client.Do(req)
		if err != nil {
			return nil, err
		}
	}

	return resp, nil
}

// GetBaseUrl returns the base REST URL for Firestore
func (fc *FirestoreClient) GetBaseUrl() string {
	if fc.useEmulator {
		return fmt.Sprintf("http://%s:8080/v1/projects/%s/databases/%s/documents", fc.emulatorHost, ProjectId, EmulatorDatabaseId)
	}
	return fmt.Sprintf("https://firestore.googleapis.com/v1/projects/%s/databases/%s/documents", ProjectId, ProdDatabaseId)
}

// GetRequest creates a HTTP request with standard Auth headers
func (fc *FirestoreClient) GetRequest(method, url string, body []byte) (*http.Request, error) {
	req, err := http.NewRequest(method, url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if !fc.useEmulator && fc.idToken != "" {
		req.Header.Set("Authorization", "Bearer "+fc.idToken)
	}
	return req, nil
}

// GetUserDictionary fetches SRS mappings from userDictionaries/{uid}
func (fc *FirestoreClient) GetUserDictionary() (map[string]map[string]int64, error) {
	docUrl := fmt.Sprintf("%s/userDictionaries/%s", fc.GetBaseUrl(), fc.uid)
	resp, err := fc.doRequest("GET", docUrl, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		// No dictionary found, return empty map
		return make(map[string]map[string]int64), nil
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get user dictionary (status %d): %s", resp.StatusCode, string(body))
	}

	var response map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, err
	}

	// Parser for nested Firestore fields mapping: words -> mapValue -> fields -> wordId -> mapValue -> fields -> (srsLevel, nextReviewAt)
	srsMap := make(map[string]map[string]int64)
	fields, ok := response["fields"].(map[string]interface{})
	if !ok {
		return srsMap, nil
	}

	wordsObj, ok := fields["words"].(map[string]interface{})
	if !ok {
		return srsMap, nil
	}

	mapValue, ok := wordsObj["mapValue"].(map[string]interface{})
	if !ok {
		return srsMap, nil
	}

	wordFields, ok := mapValue["fields"].(map[string]interface{})
	if !ok {
		return srsMap, nil
	}

	for wordId, wordData := range wordFields {
		wordDataMap, ok := wordData.(map[string]interface{})
		if !ok {
			continue
		}
		wordMapValue, ok := wordDataMap["mapValue"].(map[string]interface{})
		if !ok {
			continue
		}
		subFields, ok := wordMapValue["fields"].(map[string]interface{})
		if !ok {
			continue
		}

		srsLevelVal := int64(0)
		if srsLevelObj, exists := subFields["srsLevel"].(map[string]interface{}); exists {
			if srsLStr, ok := srsLevelObj["integerValue"].(string); ok {
				srsLevelVal, _ = strconv.ParseInt(srsLStr, 10, 64)
			}
		}

		nextReviewVal := int64(0)
		if nextReviewObj, exists := subFields["nextReviewAt"].(map[string]interface{}); exists {
			if nextRStr, ok := nextReviewObj["integerValue"].(string); ok {
				nextReviewVal, _ = strconv.ParseInt(nextRStr, 10, 64)
			}
		}

		srsMap[wordId] = map[string]int64{
			"srsLevel":     srsLevelVal,
			"nextReviewAt": nextReviewVal,
		}
	}

	return srsMap, nil
}

// GetWordsByCreator fetches all word documents where creatorId == uid
func (fc *FirestoreClient) GetWordsByCreator() ([]Word, error) {
	queryUrl := fmt.Sprintf("%s:runQuery", fc.GetBaseUrl())

	// Build runQuery payload
	queryPayload := map[string]interface{}{
		"structuredQuery": map[string]interface{}{
			"from": []interface{}{
				map[string]interface{}{"collectionId": "words"},
			},
			"where": map[string]interface{}{
				"fieldFilter": map[string]interface{}{
					"field": map[string]interface{}{"fieldPath": "creatorId"},
					"op":    "EQUAL",
					"value": map[string]interface{}{"stringValue": fc.uid},
				},
			},
		},
	}

	body, err := json.Marshal(queryPayload)
	if err != nil {
		return nil, err
	}

	resp, err := fc.doRequest("POST", queryUrl, body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to query words (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var results []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, err
	}

	words := make([]Word, 0)
	for _, result := range results {
		docObj, ok := result["document"].(map[string]interface{})
		if !ok {
			continue
		}

		name, _ := docObj["name"].(string)
		wordId := ""
		// Extract wordId from end of document name: projects/.../documents/words/{wordId}
		for i := len(name) - 1; i >= 0; i-- {
			if name[i] == '/' {
				wordId = name[i+1:]
				break
			}
		}

		fields, ok := docObj["fields"].(map[string]interface{})
		if !ok {
			continue
		}

		dutchVal := ""
		if obj, exists := fields["dutch"].(map[string]interface{}); exists {
			dutchVal, _ = obj["stringValue"].(string)
		}

		englishVal := ""
		if obj, exists := fields["english"].(map[string]interface{}); exists {
			englishVal, _ = obj["stringValue"].(string)
		}

		contextVal := ""
		if obj, exists := fields["context"].(map[string]interface{}); exists {
			contextVal, _ = obj["stringValue"].(string)
		}

		addedAtVal := int64(0)
		if obj, exists := fields["addedAt"].(map[string]interface{}); exists {
			if str, ok := obj["integerValue"].(string); ok {
				addedAtVal, _ = strconv.ParseInt(str, 10, 64)
			}
		}

		creatorIdVal := ""
		if obj, exists := fields["creatorId"].(map[string]interface{}); exists {
			creatorIdVal, _ = obj["stringValue"].(string)
		}

		// Optional examples extraction
		examplesList := make([]interface{}, 0)
		if obj, exists := fields["examples"].(map[string]interface{}); exists {
			if arrayVal, ok := obj["arrayValue"].(map[string]interface{}); ok {
				if values, ok := arrayVal["values"].([]interface{}); ok {
					examplesList = values
				}
			}
		}

		wordAudioUrlVal := ""
		if obj, exists := fields["wordAudioUrl"].(map[string]interface{}); exists {
			wordAudioUrlVal, _ = obj["stringValue"].(string)
		}

		wordTeacherAudioUrlVal := ""
		if obj, exists := fields["wordTeacherAudioUrl"].(map[string]interface{}); exists {
			wordTeacherAudioUrlVal, _ = obj["stringValue"].(string)
		}

		words = append(words, Word{
			Id:                  wordId,
			Dutch:               dutchVal,
			English:             englishVal,
			Context:             contextVal,
			AddedAt:             addedAtVal,
			CreatorId:           creatorIdVal,
			Examples:            examplesList,
			WordAudioUrl:        wordAudioUrlVal,
			WordTeacherAudioUrl: wordTeacherAudioUrlVal,
		})
	}

	return words, nil
}

// GetWordsByIds fetches word documents for the specified word IDs in chunks of 100
func (fc *FirestoreClient) GetWordsByIds(wordIds []string) ([]Word, error) {
	if len(wordIds) == 0 {
		return []Word{}, nil
	}

	var allWords []Word
	const chunkSize = 100

	for i := 0; i < len(wordIds); i += chunkSize {
		end := i + chunkSize
		if end > len(wordIds) {
			end = len(wordIds)
		}
		chunk := wordIds[i:end]

		docNames := make([]string, len(chunk))
		for idx, id := range chunk {
			docNames[idx] = fc.GetDocumentResourceName("words", id)
		}

		payload := map[string]interface{}{
			"documents": docNames,
		}

		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal batchGet payload: %v", err)
		}

		url := fmt.Sprintf("%s:batchGet", fc.GetBaseUrl())
		resp, err := fc.doRequest("POST", url, bodyBytes)
		if err != nil {
			return nil, fmt.Errorf("batchGet request failed: %v", err)
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := ioutil.ReadAll(resp.Body)
			resp.Body.Close()
			return nil, fmt.Errorf("batchGet API returned status %d: %s", resp.StatusCode, string(body))
		}

		var batchResults []BatchGetResult
		decodeErr := json.NewDecoder(resp.Body).Decode(&batchResults)
		resp.Body.Close()
		if decodeErr != nil {
			return nil, fmt.Errorf("failed to decode batchGet response: %v", decodeErr)
		}

		for _, res := range batchResults {
			if res.Found != nil {
				name := res.Found.Name
				wordId := ""
				for k := len(name) - 1; k >= 0; k-- {
					if name[k] == '/' {
						wordId = name[k+1:]
						break
					}
				}
				if wordId != "" {
					word := parseWordFromFields(wordId, res.Found.Fields)
					allWords = append(allWords, word)
				}
			}
		}
	}

	return allWords, nil
}

// UpdateWordSRS updates nested word SRS fields in userDictionaries/{uid} using patch update masks.
// If the document does not exist (HTTP 404), it intercepts the error and initializes the user's dictionary.
func (fc *FirestoreClient) UpdateWordSRS(wordId string, srsLevel int, nextReviewAt int64) error {
	baseUrl := fc.GetBaseUrl()
	docUrl := fmt.Sprintf("%s/userDictionaries/%s", baseUrl, fc.uid)

	// Format nested field update masks
	u, err := url.Parse(docUrl)
	if err != nil {
		return err
	}
	q := u.Query()
	escapedWordId := escapeFieldPathSegment(wordId)
	q.Add("updateMask.fieldPaths", fmt.Sprintf("words.%s.srsLevel", escapedWordId))
	q.Add("updateMask.fieldPaths", fmt.Sprintf("words.%s.nextReviewAt", escapedWordId))
	u.RawQuery = q.Encode()

	// Firestore patch payload
	payload := map[string]interface{}{
		"fields": map[string]interface{}{
			"words": map[string]interface{}{
				"mapValue": map[string]interface{}{
					"fields": map[string]interface{}{
						wordId: map[string]interface{}{
							"mapValue": map[string]interface{}{
								"fields": map[string]interface{}{
									"srsLevel": map[string]interface{}{
										"integerValue": strconv.Itoa(srsLevel),
									},
									"nextReviewAt": map[string]interface{}{
										"integerValue": strconv.FormatInt(nextReviewAt, 10),
									},
								},
							},
						},
					},
				},
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	resp, err := fc.doRequest("PATCH", u.String(), body)
	if err != nil {
		return err
	}

	if resp.StatusCode == http.StatusNotFound {
		resp.Body.Close()

		fmt.Printf("[FirestoreClient] Dictionary document not found for user %s. Initializing...\n", fc.uid)

		// Fallback PATCH payload to initialize the document with empty seenWords and first word's SRS
		fallbackPayload := map[string]interface{}{
			"fields": map[string]interface{}{
				"words": map[string]interface{}{
					"mapValue": map[string]interface{}{
						"fields": map[string]interface{}{
							wordId: map[string]interface{}{
								"mapValue": map[string]interface{}{
									"fields": map[string]interface{}{
										"srsLevel": map[string]interface{}{
											"integerValue": strconv.Itoa(srsLevel),
										},
										"nextReviewAt": map[string]interface{}{
											"integerValue": strconv.FormatInt(nextReviewAt, 10),
										},
									},
								},
							},
						},
					},
				},
				"seenWords": map[string]interface{}{
					"arrayValue": map[string]interface{}{
						"values": []interface{}{},
					},
				},
			},
		}

		fallbackBody, err := json.Marshal(fallbackPayload)
		if err != nil {
			return err
		}

		// Send PATCH without any query params (no updateMask)
		fallbackResp, err := fc.doRequest("PATCH", docUrl, fallbackBody)
		if err != nil {
			return fmt.Errorf("fallback initialization request failed: %v", err)
		}
		defer fallbackResp.Body.Close()

		if fallbackResp.StatusCode != http.StatusOK {
			fallbackBodyBytes, _ := ioutil.ReadAll(fallbackResp.Body)
			return fmt.Errorf("failed to initialize dictionary document (status %d): %s", fallbackResp.StatusCode, string(fallbackBodyBytes))
		}

		fmt.Printf("[FirestoreClient] Dictionary document successfully initialized for user %s with word %s\n", fc.uid, wordId)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		return fmt.Errorf("failed to patch srs metadata (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

// escapeFieldPathSegment backtick-quotes a Firestore field path segment.
// It escapes any nested backticks or backslashes.
func escapeFieldPathSegment(s string) string {
	var buf bytes.Buffer
	buf.WriteByte('`')
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '`' || c == '\\' {
			buf.WriteByte('\\')
		}
		buf.WriteByte(c)
	}
	buf.WriteByte('`')
	return buf.String()
}
