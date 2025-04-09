import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx'; // Excel 처리 (프론트에서 파싱/생성 시 필요)
import { saveAs } from 'file-saver'; // 파일 저장
// import './App.css'; // App.css 대신 index.css에서 Tailwind를 사용하므로 주석 처리 또는 삭제

// API 기본 URL
const API_BASE_URL = 'http://localhost:3001/api'; // Node.js 서버 주소

// Debounce 함수 (입력 지연 처리)
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 오늘 날짜를 YYYY-MM-DD 형식으로 반환하는 함수
function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function App() {
  const [activeTab, setActiveTab] = useState('list'); // 현재 활성화된 탭 (list, register, manage)
  const [events, setEvents] = useState([]);
  const [types, setTypes] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' }); // 성공/오류 메시지
  const [loading, setLoading] = useState(false); // 로딩 상태
  const [searchType, setSearchType] = useState(''); // 검색 - 구분
  const [searchInput, setSearchInput] = useState(''); // 검색 - 이름

  // 등록 폼 상태
  const [newEventDate, setNewEventDate] = useState(getTodayDate()); // 기본값 오늘 날짜
  const [newEventType, setNewEventType] = useState('');
  const [newEventPerson, setNewEventPerson] = useState('');
  const [newEventAmount, setNewEventAmount] = useState('');
  const [newEventNotes, setNewEventNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // 등록 중복 방지

  // 관리 탭 상태
  const [newManageType, setNewManageType] = useState(''); // 새 구분 입력

  // 파일 입력 참조
  const excelFileInputRef = useRef(null);
  const jsonFileInputRef = useRef(null);

  // 메시지 표시 함수
  const showMessage = useCallback((text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => {
      setMessage({ text: '', type: '' });
    }, 3000); // 3초 후 메시지 숨김
  }, []);

  // 구분 목록 가져오기 함수
  const fetchTypes = useCallback(async () => {
      setLoading(true); // 구분만 로드할 때도 로딩 표시
      try {
          const typesRes = await axios.get(`${API_BASE_URL}/types`);
          const fetchedTypes = typesRes.data || [];
          setTypes(fetchedTypes);
          // 등록 폼의 기본값 업데이트 (기존 선택값이 사라졌을 경우)
          if (!fetchedTypes.includes(newEventType) && fetchedTypes.length > 0) {
              setNewEventType(fetchedTypes[0]);
          }
          // 검색 폼의 기본값 업데이트 (기존 선택값이 사라졌을 경우)
          if (!fetchedTypes.includes(searchType)) {
              setSearchType(''); // 전체로 변경
          }
          return fetchedTypes; // 추가/삭제 후 사용하기 위해 반환
      } catch (error) {
          console.error("구분 목록 로드 실패:", error);
          showMessage('구분 목록을 불러오는 중 오류가 발생했습니다.', 'error');
          return types; // 오류 시 현재 상태 반환
      } finally {
          setLoading(false);
      }
  }, [newEventType, searchType, showMessage, types]); // types 추가

  // 이벤트 목록 가져오기 함수 (검색 조건 포함)
  const fetchEvents = useCallback(async (currentSearchType = searchType, currentSearchInput = searchInput) => {
    setLoading(true);
    try {
      const params = {};
      if (currentSearchType) params.searchType = currentSearchType;
      if (currentSearchInput) params.searchInput = currentSearchInput;

      const response = await axios.get(`${API_BASE_URL}/events`, { params });
      setEvents(response.data || []);
    } catch (error) {
      console.error("이벤트 목록 로드 실패:", error);
      showMessage('이벤트 목록을 불러오는 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [searchType, searchInput, showMessage]);

  // Debounced fetchEvents 함수 (이름 검색용)
  const debouncedFetchEvents = useCallback(debounce(fetchEvents, 300), [fetchEvents]);

  // 초기 데이터 로드
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        await fetchTypes(); // fetchTypes 먼저 호출하여 types 상태 설정
        await fetchEvents('', ''); // 그 다음 events 로드
      } catch (error) {
        // 오류는 각 fetch 함수 내에서 처리
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 의존성 배열을 빈 배열로 변경하여 마운트 시 한 번만 실행

  // 검색 조건 변경 시 이벤트 목록 다시 로드
  useEffect(() => {
    // searchInput은 debounce로 처리하므로 여기서는 searchType 변경 시 즉시 호출
    if (searchType !== undefined) { // 초기 로드와의 충돌 방지
      fetchEvents(searchType, searchInput);
    }
  }, [searchType]); // searchType만 의존성으로

  // 이름 검색 입력 변경 핸들러
  const handleSearchInputChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    debouncedFetchEvents(searchType, value); // Debounce 적용된 함수 호출
  };

  // 구분 검색 변경 핸들러
  const handleSearchTypeChange = (e) => {
    setSearchType(e.target.value);
    // useEffect [searchType] 에서 fetchEvents 호출됨
  };

  // 탭 변경 핸들러
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  // 이벤트 삭제 핸들러
  const handleDeleteEvent = async (id) => {
    if (window.confirm('이 항목을 삭제하시겠습니까? 삭제하면 복구할 수 없습니다.')) {
      try {
        await axios.delete(`${API_BASE_URL}/events/${id}`);
        showMessage('선택한 내역이 삭제되었습니다.', 'success');
        // 목록 새로고침 (삭제 후 반영)
        fetchEvents();
      } catch (error) {
        console.error("이벤트 삭제 실패:", error);
        showMessage('내역 삭제 중 오류가 발생했습니다.', 'error');
      }
    }
  };

  // 전체 이벤트 삭제 핸들러
  const handleDeleteAllEvents = async () => {
    if (window.confirm('모든 내역을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      try {
        await axios.delete(`${API_BASE_URL}/events`);
        showMessage('모든 내역이 삭제되었습니다.', 'success');
        setEvents([]); // 상태 즉시 비우기
      } catch (error) {
        console.error("전체 이벤트 삭제 실패:", error);
        showMessage('전체 내역 삭제 중 오류가 발생했습니다.', 'error');
      }
    }
  };

  // 이벤트 등록 핸들러
  const handleRegisterEvent = async (e) => {
    e.preventDefault(); // 폼 기본 제출 방지
    if (isSubmitting) return; // 중복 제출 방지

    // 유효성 검사
    if (!newEventDate || !newEventType || !newEventPerson) {
      showMessage('날짜, 구분, 대상자는 필수 항목입니다.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const eventData = {
        date: newEventDate,
        type: newEventType,
        person: newEventPerson,
        amount: newEventAmount || null, // 빈 값은 null로 처리
        notes: newEventNotes,
      };
      await axios.post(`${API_BASE_URL}/events`, eventData);
      showMessage('새로운 내역이 추가되었습니다.', 'success');

      // 폼 초기화
      setNewEventDate(getTodayDate());
      setNewEventType(types.length > 0 ? types[0] : ''); // 첫번째 타입 또는 빈 값
      setNewEventPerson('');
      setNewEventAmount('');
      setNewEventNotes('');

      // 조회 탭 목록 갱신
      fetchEvents();

      // 등록 후 조회 탭으로 이동 (선택 사항)
      // setActiveTab('list');

    } catch (error) {
      console.error("이벤트 등록 실패:", error);
      showMessage('내역 등록 중 오류가 발생했습니다. (' + (error.response?.data?.message || error.message) + ')', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 구분 추가 핸들러
  const handleAddType = async () => {
    const typeName = newManageType.trim();
    if (!typeName) {
      showMessage('추가할 구분 이름을 입력하세요.', 'error');
      return;
    }
    if (types.includes(typeName)) {
      showMessage(`'${typeName}' 구분은 이미 존재합니다.`, 'error');
      return;
    }

    setLoading(true); // 로딩 시작
    try {
      const response = await axios.post(`${API_BASE_URL}/types`, { typeName });
      setTypes(response.data.types || []); // 서버에서 반환된 최신 목록으로 업데이트
      setNewManageType(''); // 입력 필드 비우기
      showMessage(`'${typeName}' 구분이 추가되었습니다.`, 'success');
      // 등록 폼의 기본값 업데이트 (types 상태 변경 후)
       if (response.data.types && response.data.types.length === 1) {
           setNewEventType(response.data.types[0]); // 첫번째 타입이면 기본값으로
       }
    } catch (error) {
      console.error("구분 추가 실패:", error);
      showMessage('구분 추가 중 오류가 발생했습니다. (' + (error.response?.data?.message || error.message) + ')', 'error');
    } finally {
      setLoading(false); // 로딩 종료
    }
  };

  // 구분 삭제 핸들러
  const handleDeleteType = async (typeToDelete) => {
    if (window.confirm(`'${typeToDelete}' 구분을 삭제하시겠습니까? 이 구분을 사용한 기존 내역에는 영향을 주지 않습니다.`)) {
      setLoading(true);
      try {
        // URL 인코딩 필수
        const encodedTypeName = encodeURIComponent(typeToDelete);
        const response = await axios.delete(`${API_BASE_URL}/types/${encodedTypeName}`);
        const updatedTypes = response.data.types || [];
        setTypes(updatedTypes); // 서버 응답으로 상태 업데이트
        showMessage(`'${typeToDelete}' 구분이 삭제되었습니다.`, 'success');

        // 등록/검색 폼의 선택값 조정
        if (newEventType === typeToDelete) {
            setNewEventType(updatedTypes.length > 0 ? updatedTypes[0] : '');
        }
        if (searchType === typeToDelete) {
            setSearchType(''); // 전체로
        }
      } catch (error) {
        console.error("구분 삭제 실패:", error);
        showMessage('구분 삭제 중 오류가 발생했습니다. (' + (error.response?.data?.message || error.message) + ')', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  // JSON 내보내기 핸들러
  const handleExportJson = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/export/json`, {
        responseType: 'blob', // Blob 형태로 응답 받기
      });
      // 파일 이름 추출 (Content-Disposition 헤더 활용)
      const contentDisposition = response.headers['content-disposition'];
      let fileName = `event_manager_backup_${getTodayDate()}.json`; // 기본 파일 이름
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/i);
        if (fileNameMatch && fileNameMatch.length > 1) {
          fileName = fileNameMatch[1];
        }
      }
      saveAs(response.data, fileName);
      showMessage('JSON 파일이 저장되었습니다.', 'success');
    } catch (error) {
      console.error("JSON export error:", error);
      showMessage('JSON 데이터 내보내기 중 오류 발생', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 파일 Import 공통 로직
  const handleImportFile = async (file, importType) => {
    if (!file) return;

    const formData = new FormData();
    let apiUrl = '';
    let fileKey = '';

    if (importType === 'excel') {
      formData.append('excelFile', file);
      apiUrl = `${API_BASE_URL}/import/excel`;
      fileKey = 'excelFile';
    } else if (importType === 'json') {
      formData.append('jsonFile', file);
      apiUrl = `${API_BASE_URL}/import/json`;
      fileKey = 'jsonFile';
    } else {
      showMessage('지원하지 않는 파일 형식입니다.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(apiUrl, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      showMessage(response.data.message || `${importType.toUpperCase()} 파일 가져오기 성공`, 'success');
      // 데이터 새로고침
      await fetchTypes();
      await fetchEvents();
    } catch (error) {
      console.error(`${importType.toUpperCase()} import error:`, error);
      showMessage(`${importType.toUpperCase()} 파일 가져오기 오류: ` + (error.response?.data?.message || error.message), 'error');
    } finally {
      setLoading(false);
      // 파일 입력 필드 초기화
      if (excelFileInputRef.current) excelFileInputRef.current.value = '';
      if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
    }
  };

  // Excel Import 핸들러
  const handleExcelFileChange = (event) => {
    const file = event.target.files[0];
    handleImportFile(file, 'excel');
  };

  // JSON Import 핸들러
  const handleJsonFileChange = (event) => {
    const file = event.target.files[0];
    handleImportFile(file, 'json');
  };

  // --- 각 탭별 컴포넌트 렌더링 로직 (추후 분리 예정) ---
  const renderListTab = () => (
    <div>
      {/* 검색 UI */}
      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="search-type" className="block text-sm font-medium text-gray-700 mb-1">구분으로 검색</label>
          <select
            id="search-type"
            value={searchType}
            onChange={handleSearchTypeChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            disabled={loading} // 로딩 중 비활성화
          >
            <option value="">전체</option>
            {types.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="search-input" className="block text-sm font-medium text-gray-700 mb-1">이름으로 검색</label>
          <div className="relative rounded-md shadow-sm">
            <span className="lucide text-gray-400 absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">&#xE44B;</span>
            <input
              type="search"
              id="search-input"
              placeholder="검색할 이름 입력..."
              value={searchInput}
              onChange={handleSearchInputChange}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              disabled={loading} // 로딩 중 비활성화
            />
          </div>
        </div>
      </div>

      {/* 이벤트 테이블 */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-md">
          <thead className="bg-gray-50">
            <tr>
              {/* 테이블 헤더 컬럼들 */}
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">번호</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">날짜</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">구분</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">대상자</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">금액(만원)</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">메모</th>
              <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                {/* 전체 삭제 버튼 */}
                <button
                  onClick={handleDeleteAllEvents}
                  className="text-red-600 hover:text-red-900 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="전체 삭제"
                  disabled={events.length === 0 || loading || isSubmitting} // 등록 중일 때도 비활성화
                >
                  <span className="lucide">&#xE4CF;</span> 전체 삭제
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading && !isSubmitting ? ( // 로딩 중 표시 (등록 중 아닐 때만)
              <tr>
                <td colSpan="7" className="px-4 py-4 text-center text-sm text-gray-500">로딩 중...</td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-4 text-center text-sm text-gray-500">
                  {searchInput || searchType ? '검색 결과가 없습니다.' : '등록된 내역이 없습니다.'}
                </td>
              </tr>
            ) : (
              events.map((event, index) => (
                <tr key={event.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{index + 1}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{event.date}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{event.type}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{event.person}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                    {event.amount ? parseInt(event.amount, 10).toLocaleString('ko-KR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 break-words max-w-xs">{event.notes || '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-medium">
                    {/* 개별 삭제 버튼 */}
                    <button
                      onClick={() => handleDeleteEvent(event.id)}
                      className="text-red-600 hover:text-red-900 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="삭제"
                      disabled={loading || isSubmitting} // 로딩 또는 등록 중일 때 비활성화
                    >
                      <span className="lucide">&#xE4CF;</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderRegisterTab = () => (
     <form onSubmit={handleRegisterEvent} className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-8">
        {/* 날짜 */}
        <div className="w-full">
            <label htmlFor="event-date" className="block text-sm font-medium text-gray-700 mb-1">날짜</label>
            <input
                type="date"
                id="event-date"
                value={newEventDate}
                onChange={(e) => setNewEventDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                required
            />
        </div>
        {/* 구분 */}
        <div className="w-full">
            <label htmlFor="event-type" className="block text-sm font-medium text-gray-700 mb-1">구분</label>
            <select
                id="event-type"
                value={newEventType}
                onChange={(e) => setNewEventType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                required
            >
                {/* 초기 로딩 시 또는 타입이 없을 때 */}
                {types.length === 0 && <option value="" disabled>{loading ? '로딩 중...' : '등록된 구분 없음'}</option>} 
                {types.map(type => (
                    <option key={type} value={type}>{type}</option>
                ))}
            </select>
        </div>
        {/* 대상자 */}
        <div className="w-full">
            <label htmlFor="event-person" className="block text-sm font-medium text-gray-700 mb-1">대상자</label>
            <input
                type="text"
                id="event-person"
                value={newEventPerson}
                onChange={(e) => setNewEventPerson(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                required
            />
        </div>
        {/* 금액 */}
        <div className="w-full">
            <label htmlFor="event-amount" className="block text-sm font-medium text-gray-700 mb-1">금액 (만원)</label>
            <input
                type="number"
                id="event-amount"
                value={newEventAmount}
                onChange={(e) => setNewEventAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                min="0" // 음수 입력 방지
            />
        </div>
        {/* 메모 */}
        <div className="w-full md:col-span-2">
            <label htmlFor="event-memo" className="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <textarea
                id="event-memo"
                rows="3"
                value={newEventNotes}
                onChange={(e) => setNewEventNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            ></textarea>
        </div>
        {/* 등록 버튼 */}
        <div className="w-full md:col-span-2">
            <button
                type="submit"
                disabled={isSubmitting || loading} // 등록 중이거나 다른 로딩 중일 때 비활성화
                className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSubmitting ? '등록 중...' : '등록'}
            </button>
        </div>
    </form>
  );

  const renderManageTab = () => (
    <div className="space-y-8">
      <div className="border p-4 rounded">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">구분 관리</h3>
        {/* 구분 추가 UI */}
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            value={newManageType}
            onChange={(e) => setNewManageType(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddType()} // Enter 키로 추가
            placeholder="새 구분 입력"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            disabled={loading}
          />
          <button
            onClick={handleAddType}
            className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || isSubmitting}
          >
            추가
          </button>
        </div>
        {/* 구분 목록 */} 
        <ul className="space-y-2">
          {types.map(type => (
            <li key={type} className="flex justify-between items-center text-sm py-1 border-b border-gray-100 last:border-b-0">
              <span>{type}</span>
              {/* 구분 삭제 버튼 */} 
              <button
                onClick={() => handleDeleteType(type)}
                className="text-red-500 hover:text-red-700 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title="삭제"
                disabled={loading || isSubmitting}
              >
                <span className="lucide text-sm">&#xE4CF;</span>
              </button>
            </li>
          ))}
          {/* 로딩 중이 아니고, 타입이 없을 때 메시지 표시 */} 
          {!loading && types.length === 0 && (
            <li className="text-sm text-gray-500 py-2">등록된 구분이 없습니다.</li>
          )}
        </ul>
         {/* 로딩 표시 (구분 목록 로딩 시) */}
        {loading && !isSubmitting && <p className="text-sm text-gray-500 mt-2">목록 로딩 중...</p>}
      </div>
       <div className="border p-4 rounded">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">데이터 관리</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Excel Import */}
            <div>
                <h4 className="text-md font-medium mb-2 text-gray-700">Excel 가져오기</h4>
                <p className="text-sm text-gray-600 mb-2">
                    기존 데이터에 추가됩니다. (.xlsx, .xls)<br/>
                    필수 헤더: 날짜, 구분, 대상자
                </p>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  ref={excelFileInputRef}
                  onChange={handleExcelFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"
                  disabled={loading || isSubmitting}
                />
            </div>
            {/* JSON Import/Export */} 
            <div>
                <h4 className="text-md font-medium mb-2 text-gray-700">JSON 데이터</h4>
                <div className="space-y-2">
                    <button
                      onClick={handleExportJson}
                      className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      disabled={loading || isSubmitting}
                    >
                        <span className="lucide mr-2">&#xE2C4;</span> JSON 내보내기 (백업)
                    </button>
                    <div className="relative">
                        {/* 숨겨진 실제 파일 입력 */}
                        <input
                          type="file"
                          accept=".json"
                          ref={jsonFileInputRef}
                          onChange={handleJsonFileChange}
                          className="hidden"
                          disabled={loading || isSubmitting}
                        />
                        {/* 파일 입력을 트리거하는 버튼 */}
                        <button
                          onClick={() => jsonFileInputRef.current?.click()} // 숨겨진 input 클릭
                          className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                          disabled={loading || isSubmitting}
                        >
                            <span className="lucide mr-2">&#xE2C5;</span> JSON 가져오기 (덮어쓰기)
                        </button>
                    </div>
                </div>
            </div>
        </div>
       </div>
    </div>
  );

  return (
    <div className="bg-gray-100 min-h-screen p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto bg-white p-6 md:p-8 rounded-lg shadow-md">
        <h1 className="text-2xl md:text-3xl font-bold mb-6 text-center text-gray-800">Event Management (React + Vite)</h1>

        {/* 메시지 표시 영역 */} 
        {message.text && (
          <div
            className={`fixed top-5 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded shadow-lg text-sm z-50 mb-4 ${ 
              message.type === 'success' ? 'bg-green-100 border border-green-300 text-green-800' : 'bg-red-100 border border-red-300 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 탭 버튼 */} 
        <div className="mb-6 flex border-b border-gray-300">
          <button
            className={`px-4 py-2 -mb-px border-b-2 ${activeTab === 'list' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            onClick={() => handleTabChange('list')}
          >
            조회
          </button>
          <button
             className={`ml-4 px-4 py-2 -mb-px border-b-2 ${activeTab === 'register' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            onClick={() => handleTabChange('register')}
          >
            등록
          </button>
          <button
             className={`ml-4 px-4 py-2 -mb-px border-b-2 ${activeTab === 'manage' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            onClick={() => handleTabChange('manage')}
          >
            관리
          </button>
        </div>

        {/* 탭 컨텐츠 */} 
        <div className="mt-6">
          {activeTab === 'list' && renderListTab()}
          {activeTab === 'register' && renderRegisterTab()}
          {activeTab === 'manage' && renderManageTab()}
        </div>
      </div>
    </div>
  );
}

export default App;
