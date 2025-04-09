const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer'); // 파일 업로드 처리
const xlsx = require('xlsx'); // Excel 파일 처리
const fs = require('fs'); // 파일 시스템 접근 (JSON 저장/로드용)
const path = require('path'); // 경로 처리

const app = express();
const port = process.env.PORT || 3001; // 포트 설정 (React 개발 서버와 충돌 방지)

// --- 데이터 저장소 ---
let events = [];
let types = ['결혼', '장례']; // 기본 구분
let nextEventId = 1;

// 데이터 파일 경로 설정 (예: server 디렉토리 내 data 폴더)
const dataDir = path.join(__dirname, 'data');
const eventsFilePath = path.join(dataDir, 'events.json');
const typesFilePath = path.join(dataDir, 'types.json');

// 데이터 디렉토리 생성 (없으면)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// --- 데이터 로드/저장 함수 ---
function loadData() {
  try {
    if (fs.existsSync(eventsFilePath)) {
      const eventsData = fs.readFileSync(eventsFilePath, 'utf-8');
      events = JSON.parse(eventsData);
      // 가장 큰 id를 찾아 nextEventId 설정 (데이터 유실 방지)
      if (events.length > 0) {
        nextEventId = Math.max(...events.map(e => e.id)) + 1;
      }
    } else {
      events = []; // 파일 없으면 초기화
      nextEventId = 1;
    }
    if (fs.existsSync(typesFilePath)) {
      const typesData = fs.readFileSync(typesFilePath, 'utf-8');
      types = JSON.parse(typesData);
    } else {
      types = ['결혼', '장례']; // 파일 없으면 기본값
    }
  } catch (error) {
    console.error("데이터 로드 실패:", error);
    // 오류 발생 시 기본값으로 초기화
    events = [];
    types = ['결혼', '장례'];
    nextEventId = 1;
  }
}

function saveData() {
  try {
    fs.writeFileSync(eventsFilePath, JSON.stringify(events, null, 2), 'utf-8');
    fs.writeFileSync(typesFilePath, JSON.stringify(types, null, 2), 'utf-8');
  } catch (error) {
    console.error("데이터 저장 실패:", error);
  }
}

// 서버 시작 시 데이터 로드
loadData();

// --- 파일 업로드 설정 (multer) ---
// 메모리에 파일 저장 (작은 파일에 적합)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// 디스크에 파일 저장 (필요시 사용)
// const uploadDir = path.join(__dirname, 'uploads');
// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir);
// }
// const diskStorage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, uploadDir);
//   },
//   filename: function (req, file, cb) {
//     // 파일 이름 충돌 방지 (타임스탬프 추가 등)
//     cb(null, Date.now() + '-' + file.originalname);
//   }
// });
// const diskUpload = multer({ storage: diskStorage });


// 미들웨어 설정
app.use(cors()); // CORS 허용
app.use(bodyParser.json()); // JSON 요청 본문 파싱

// --- API 엔드포인트 ---

// 구분(Types) API
app.get('/api/types', (req, res) => {
  res.json(types);
});

app.post('/api/types', (req, res) => {
  const { typeName } = req.body;
  if (typeName && !types.includes(typeName)) {
    types.push(typeName);
    saveData(); // 변경 사항 저장
    res.status(201).json({ message: `'${typeName}' 구분이 추가되었습니다.`, types });
  } else if (types.includes(typeName)) {
    res.status(400).json({ message: `'${typeName}' 구분은 이미 존재합니다.` });
  } else {
    res.status(400).json({ message: '추가할 구분 이름을 입력하세요.' });
  }
});

app.delete('/api/types/:typeName', (req, res) => {
  const typeToDelete = decodeURIComponent(req.params.typeName); // URL 디코딩
  const initialLength = types.length;
  types = types.filter(type => type !== typeToDelete);
  if (types.length < initialLength) {
    saveData(); // 변경 사항 저장
    res.json({ message: `'${typeToDelete}' 구분이 삭제되었습니다.`, types });
  } else {
    res.status(404).json({ message: '삭제할 구분을 찾지 못했습니다.' });
  }
});

// 이벤트(Events) API
app.get('/api/events', (req, res) => {
  const { searchType, searchInput } = req.query;
  let filteredEvents = [...events];

  if (searchType) {
    filteredEvents = filteredEvents.filter(event => event.type === searchType);
  }
  if (searchInput) {
    const searchTerm = searchInput.toLowerCase();
    filteredEvents = filteredEvents.filter(event =>
      event.person && event.person.toLowerCase().includes(searchTerm)
    );
  }

  // 날짜 기준 내림차순 정렬
  filteredEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json(filteredEvents);
});

app.post('/api/events', (req, res) => {
  const { date, type, person, amount, notes } = req.body;

  if (!date || !type || !person) {
    return res.status(400).json({ message: '날짜, 구분, 대상자는 필수 항목입니다.' });
  }

  const newEvent = {
    id: nextEventId++,
    date,
    type,
    person: person.trim(),
    amount: amount || null, // 금액이 없으면 null
    notes: notes ? notes.trim() : '',
  };
  events.push(newEvent);
  saveData(); // 변경 사항 저장
  res.status(201).json({ message: '새로운 내역이 추가되었습니다.', event: newEvent });
});

app.delete('/api/events/:id', (req, res) => {
  const idToDelete = parseInt(req.params.id, 10);
  const initialLength = events.length;
  events = events.filter(event => event.id !== idToDelete);
  if (events.length < initialLength) {
    saveData(); // 변경 사항 저장
    res.json({ message: '선택한 내역이 삭제되었습니다.' });
  } else {
    res.status(404).json({ message: '삭제할 항목을 찾지 못했습니다.' });
  }
});

app.delete('/api/events', (req, res) => {
  events = [];
  nextEventId = 1;
  saveData(); // 변경 사항 저장 (빈 배열 저장)
  res.json({ message: '모든 내역이 삭제되었습니다.' });
});

// --- 파일 Import/Export API ---

// Excel 파일 Import API
app.post('/api/import/excel', upload.single('excelFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '엑셀 파일이 업로드되지 않았습니다.' });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    // header: 1 -> 헤더를 배열의 첫 요소로 가져옴
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length < 2) {
      return res.status(400).json({ message: '엑셀 파일에 헤더 또는 데이터가 없습니다.' });
    }

    const headers = jsonData[0].map(h => String(h).trim());
    const requiredHeaders = ['날짜', '구분', '대상자'];
    const missingHeaders = requiredHeaders.filter(rh => !headers.includes(rh));

    if (missingHeaders.length > 0) {
      return res.status(400).json({ message: `엑셀 파일에 필수 헤더가 누락되었습니다: ${missingHeaders.join(', ')}` });
    }

    const headerMap = {};
    headers.forEach((h, index) => { headerMap[h] = index; });

    let addedCount = 0;
    const importedEvents = [];
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      // 필수 데이터 존재 여부 확인 (빈 행 스킵)
      if (row[headerMap['날짜']] && row[headerMap['구분']] && row[headerMap['대상자']]) {
        let excelDate = row[headerMap['날짜']];
        let formattedDate = '';
        if (excelDate instanceof Date) {
          const year = excelDate.getFullYear();
          const month = String(excelDate.getMonth() + 1 ).padStart(2, '0');
          const day = String(excelDate.getDate()).padStart(2, '0');
          formattedDate = `${year}-${month}-${day}`;
        } else if (typeof excelDate === 'number') { // Excel 날짜 숫자 형식 처리
          const dateObj = xlsx.SSF.parse_date_code(excelDate);
          if (dateObj) {
               const year = dateObj.y;
               const month = String(dateObj.m).padStart(2, '0');
               const day = String(dateObj.d).padStart(2, '0');
               formattedDate = `${year}-${month}-${day}`;
          }
        } else if (typeof excelDate === 'string') { // 문자열 형식도 일단 허용
          formattedDate = excelDate;
        }

        const newEvent = {
          id: nextEventId++, // 새 ID 할당
          date: formattedDate,
          type: String(row[headerMap['구분']] || '').trim(),
          person: String(row[headerMap['대상자']] || '').trim(),
          amount: String(row[headerMap['금액']] || '').trim() || null, // 금액 처리
          notes: String(row[headerMap['메모']] || '').trim(),
        };
        importedEvents.push(newEvent);
        addedCount++;
      }
    }

    events.push(...importedEvents); // 기존 데이터에 추가
    saveData(); // 변경 사항 저장

    res.json({ message: `${addedCount}개의 내역을 엑셀 파일에서 가져왔습니다.` });

  } catch (error) {
    console.error("Excel import error:", error);
    res.status(500).json({ message: '엑셀 파일을 처리하는 중 오류가 발생했습니다. 파일 형식이나 내용을 확인하세요.' });
  }
});

// JSON 파일 Import API
app.post('/api/import/json', upload.single('jsonFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'JSON 파일이 업로드되지 않았습니다.' });
  }

  try {
    const jsonData = JSON.parse(req.file.buffer.toString('utf-8'));
    if (jsonData && Array.isArray(jsonData.events) && Array.isArray(jsonData.types)) {
      // JSON 데이터로 덮어쓰기
      events = jsonData.events.map(e => ({ ...e, id: nextEventId++ })); // ID 재할당
      types = jsonData.types;
      saveData(); // 변경 사항 저장
      res.json({ message: `${events.length}개의 이벤트와 ${types.length}개의 구분을 JSON 파일에서 가져왔습니다. 기존 데이터는 덮어쓰였습니다.` });
    } else {
      res.status(400).json({ message: "잘못된 JSON 파일 형식입니다. 'events'와 'types' 배열이 필요합니다." });
    }
  } catch (error) {
    console.error("JSON import error:", error);
    res.status(500).json({ message: 'JSON 파일을 처리하는 중 오류가 발생했습니다.' });
  }
});

// JSON 데이터 Export API (다운로드)
app.get('/api/export/json', (req, res) => {
  try {
    // 현재 events와 types 데이터를 가져옵니다.
    const dataToExport = {
      events: events,
      types: types,
      lastExported: new Date().toISOString(),
    };

    // JSON 문자열로 변환합니다.
    const jsonData = JSON.stringify(dataToExport, null, 2);

    // 파일 이름을 생성합니다.
    const dateString = new Date().toISOString().split('T')[0];
    const fileName = `event_manager_backup_${dateString}.json`;

    // 응답 헤더를 설정하여 파일 다운로드를 유도합니다.
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); // UTF-8 명시

    // JSON 데이터를 응답으로 보냅니다.
    res.send(jsonData);

  } catch (error) {
    console.error("JSON export error:", error);
    res.status(500).json({ message: 'JSON 데이터를 내보내는 중 오류가 발생했습니다.' });
  }
});


// 서버 시작
app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
}); 